#!/usr/bin/env python3
"""
Workflow Test Harness

Reads tests/process_registry.json, executes each workflow via isolated
Claude sessions, verifies results against live HubSpot, and writes
structured run results to tests/runs/.

Three tiers:
  A (raw)   — base prompt + curl templates + token only
  B (skill) — base prompt + curl templates + token + SKILL.md
  C (MCP)   — base prompt + SKILL.md + MCP tools (no raw token in prompt)

Usage:
  python3 tests/test_harness.py                              # All processes, both tiers
  python3 tests/test_harness.py --process contact.create     # Single process
  python3 tests/test_harness.py --tier A                     # Single tier
  python3 tests/test_harness.py --tier A --tier B            # Explicit both
  python3 tests/test_harness.py --dry-run                    # Preview only

Requires:
  - `claude` CLI installed and authenticated
  - HUBSPOT_TOKEN environment variable
"""

import json
import os
import re
import subprocess
import sys
import argparse
import time
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODEL = "opus"
PROJECT_ROOT = Path(__file__).parent.parent
TESTS_DIR = Path(__file__).parent
REGISTRY_PATH = TESTS_DIR / "process_registry.json"
RUNS_DIR = TESTS_DIR / "runs"
SKILL_PATH = (
    PROJECT_ROOT / "plugins" / "pluginbrands-toolkit"
    / "skills" / "hubspot-api-query" / "SKILL.md"
)

HUBSPOT_API_BASE = "https://api.hubapi.com"
TEST_TIMEOUT = 600  # seconds per Claude session
VERIFY_DELAY = 5    # seconds to wait for HubSpot indexing before verify


# ---------------------------------------------------------------------------
# HubSpot API helper
# ---------------------------------------------------------------------------


def hubspot_api(
    token: str,
    method: str,
    endpoint: str,
    body: dict | None = None,
    timeout: int = 30,
) -> tuple[int, dict | None]:
    """
    Make a HubSpot API call via curl subprocess.

    Returns (http_status_code, parsed_json_body_or_None).
    """
    url = HUBSPOT_API_BASE + endpoint

    cmd = [
        "curl", "-s",
        "-w", "\n%{http_code}",
        "-X", method,
        "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json",
    ]

    if body is not None and method in ("POST", "PUT", "PATCH"):
        cmd.extend(["-d", json.dumps(body)])

    cmd.append(url)

    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return (0, None)
    except Exception:
        return (0, None)

    raw = proc.stdout.strip()
    if not raw:
        return (0, None)

    # Last line is the HTTP status code (from -w flag)
    lines = raw.rsplit("\n", 1)
    if len(lines) == 2:
        body_text, status_text = lines
    else:
        body_text = ""
        status_text = lines[0]

    try:
        status_code = int(status_text.strip())
    except ValueError:
        return (0, None)

    if not body_text.strip():
        return (status_code, None)

    try:
        parsed = json.loads(body_text)
    except json.JSONDecodeError:
        return (status_code, None)

    return (status_code, parsed)


# ---------------------------------------------------------------------------
# Capture resolver (JSONPath extraction + variable interpolation)
# ---------------------------------------------------------------------------


def extract_jsonpath(data: dict, path: str) -> str | None:
    """
    Evaluate a simple JSONPath expression against a dict.

    Supports: $.results[0].id, $.results[0].properties.name
    Returns the extracted value as a string, or None if not found.
    """
    # Strip leading "$."
    path = re.sub(r"^\$\.?", "", path)
    segments = path.split(".")

    current = data
    for segment in segments:
        if current is None:
            return None

        # Check for array index: e.g. results[0]
        match = re.match(r"(\w+)\[(\d+)\]", segment)
        if match:
            key, index = match.group(1), int(match.group(2))
            try:
                current = current[key][index]
            except (KeyError, IndexError, TypeError):
                return None
        else:
            try:
                current = current[segment]
            except (KeyError, TypeError):
                return None

    return str(current) if current is not None else None


def resolve_captures(template: str, captures: dict[str, str]) -> str:
    """
    Replace {variable_name} placeholders with captured values.

    Unresolved placeholders are left as-is.
    """
    return re.sub(
        r"\{(\w+)\}",
        lambda m: captures.get(m.group(1), m.group(0)),
        template,
    )


# ---------------------------------------------------------------------------
# Assertion evaluator
# ---------------------------------------------------------------------------


def evaluate_assertion(
    assertion: dict,
    record_properties: dict,
    captures: dict[str, str],
    record_id: str,
    source_object_type: str,
    token: str,
) -> tuple[bool, str]:
    """
    Evaluate a single assertion against a HubSpot record.

    Returns (passed, evidence_string).
    """
    operator = assertion["operator"]
    expected = resolve_captures(str(assertion.get("value", "")), captures)

    # --- associated_to ---
    if operator == "associated_to":
        object_type = assertion["object_type"]
        endpoint = f"/crm/v3/objects/{source_object_type}/{record_id}/associations/{object_type}"
        status, response = hubspot_api(token, "GET", endpoint)

        if status != 200 or not response:
            return (False, f"Association check failed (status={status})")

        results = response.get("results", [])
        found_ids = [str(r.get("toObjectId", r.get("id", ""))) for r in results]

        if expected in found_ids:
            return (True, f"{source_object_type}/{record_id} associated to {object_type}/{expected}")
        else:
            return (False, f"{source_object_type}/{record_id} NOT associated to {object_type}/{expected} (found: {found_ids})")

    # --- timestamps_chronological (multi-field, must be checked before single-field null guard) ---
    if operator == "timestamps_chronological":
        # Checks that a list of timestamp fields are all non-null and in chronological order.
        # 'field' is a semicolon-separated list of property names.
        field = assertion["field"]
        fields = [f.strip() for f in field.split(";")]
        timestamps = []
        for ts_field in fields:
            val = record_properties.get(ts_field)
            if val is None or str(val).strip() == "":
                return (False, f"'{ts_field}' is null — stage was never entered")
            timestamps.append((ts_field, str(val)))
        # Check chronological order (ISO timestamps sort lexicographically)
        for i in range(len(timestamps) - 1):
            if timestamps[i][1] > timestamps[i + 1][1]:
                return (
                    False,
                    f"Out of order: '{timestamps[i][0]}' ({timestamps[i][1]}) > "
                    f"'{timestamps[i + 1][0]}' ({timestamps[i + 1][1]})",
                )
        stage_summary = " → ".join(f"{t[0].split('_')[-1]}" for t in timestamps)
        return (True, f"Stages entered in order: {stage_summary}")

    # --- eq / contains / not_null (single-field operators) ---
    field = assertion["field"]
    actual = record_properties.get(field)

    if operator == "not_null":
        if actual is not None and str(actual).strip() != "":
            return (True, f"'{field}' is set ('{str(actual)[:40]}')")
        else:
            return (False, f"'{field}' is null or empty")

    if actual is None:
        return (False, f"'{field}' is null (not returned by HubSpot)")

    actual_str = str(actual)

    if operator == "eq":
        if actual_str.lower() == expected.lower():
            return (True, f"'{field}' = '{actual_str}'")
        else:
            return (False, f"'{field}' = '{actual_str}' (expected '{expected}')")

    if operator == "contains":
        if expected.lower() in actual_str.lower():
            return (True, f"'{field}' contains '{expected}'")
        else:
            return (False, f"'{field}' = '{actual_str}' (does not contain '{expected}')")

    return (False, f"Unknown operator '{operator}'")


# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------


def build_system_prompt(tier: str, token: str) -> str:
    """
    Build the system prompt for a given tier.

    Tier A: base prompt + curl templates + token
    Tier B: base prompt + curl templates + token + SKILL.md
    Tier C: base prompt + SKILL.md + MCP tools (no raw token)
    """
    if tier == "C":
        base_prompt = (
            "You are an assistant that helps manage a HubSpot CRM system. "
            "You have MCP tools available for HubSpot operations. "
            "Use the search_objects, get_object, create_object, update_object, "
            "batch_read, get_associations, create_association, list_pipelines, "
            "and list_owners tools.\n\n"
            "Execute the workflow described. Create, update, or associate records as instructed. "
            "If data appears missing, broken, or inconsistent, say so explicitly."
        )
        parts = [base_prompt]
        if SKILL_PATH.exists():
            skill_text = SKILL_PATH.read_text()
            parts.append("\n\n--- ACTIVE SKILL ---\n\n")
            parts.append(skill_text)
        return "".join(parts)

    curl_reference = (
        "\n\n## Curl Reference\n\n"
        "```bash\n"
        "# List objects with properties\n"
        f'curl -s -H "Authorization: Bearer {token}" \\\n'
        '  "https://api.hubapi.com/crm/v3/objects/{{objectType}}?limit=100&properties=field1,field2"\n\n'
        "# Search with filters\n"
        f'curl -s -X POST -H "Authorization: Bearer {token}" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  "https://api.hubapi.com/crm/v3/objects/{{objectType}}/search" \\\n'
        "  -d '{\"filterGroups\":[{\"filters\":[{\"propertyName\":\"field\",\"operator\":\"EQ\",\"value\":\"val\"}]}],\"properties\":[\"field1\"],\"limit\":100}'\n\n"
        "# Get a single record\n"
        f'curl -s -H "Authorization: Bearer {token}" \\\n'
        '  "https://api.hubapi.com/crm/v3/objects/{{objectType}}/{{recordId}}"\n\n'
        "# Get associations\n"
        f'curl -s -H "Authorization: Bearer {token}" \\\n'
        '  "https://api.hubapi.com/crm/v3/objects/{{objectType}}/{{recordId}}/associations/{{toObjectType}}"\n\n'
        "# Create a record\n"
        f'curl -s -X POST -H "Authorization: Bearer {token}" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  "https://api.hubapi.com/crm/v3/objects/{{objectType}}" \\\n'
        "  -d '{\"properties\":{\"key\":\"value\"}}'\n\n"
        "# Associate two records\n"
        f'curl -s -X PUT -H "Authorization: Bearer {token}" \\\n'
        '  "https://api.hubapi.com/crm/v3/objects/{{objectType}}/{{recordId}}/associations/{{toObjectType}}/{{toRecordId}}/{{associationType}}"\n\n'
        "# Get pipeline stages\n"
        f'curl -s -H "Authorization: Bearer {token}" \\\n'
        '  "https://api.hubapi.com/crm/v3/pipelines/{{objectType}}"\n\n'
        "# Get all properties for an object type\n"
        f'curl -s -H "Authorization: Bearer {token}" \\\n'
        '  "https://api.hubapi.com/crm/v3/properties/{{objectType}}"\n'
        "```"
    )

    base_prompt = (
        "You are an assistant that helps manage a HubSpot CRM system. "
        "You can use curl to make HubSpot API calls.\n\n"
        f"HubSpot API token: {token}\n"
        "HubSpot API base URL: https://api.hubapi.com\n\n"
        "Include the token as: -H 'Authorization: Bearer TOKEN'\n"
        "Always use: -H 'Content-Type: application/json'\n\n"
        "Execute the workflow described. Create, update, or associate records as instructed. "
        "If data appears missing, broken, or inconsistent, say so explicitly."
        + curl_reference
    )

    parts = [base_prompt]

    if tier == "B":
        if SKILL_PATH.exists():
            skill_text = SKILL_PATH.read_text()
            parts.append("\n\n--- ACTIVE SKILL ---\n\n")
            parts.append(skill_text)
        else:
            print(f"  WARNING: Skill file not found at {SKILL_PATH}")

    return "".join(parts)


# ---------------------------------------------------------------------------
# Claude executor
# ---------------------------------------------------------------------------


def execute_claude_session(
    prompt: str,
    system_prompt: str,
    dry_run: bool = False,
    tier: str = "A",
) -> dict:
    """
    Spawn an isolated Claude session and return the result.
    """
    if dry_run:
        return {
            "output": "[DRY RUN]",
            "exit_code": 0,
            "elapsed_seconds": 0,
            "cost_usd": None,
            "num_turns": None,
            "error": None,
        }

    cmd = [
        "claude",
        "--print",
        "--model", MODEL,
        "--output-format", "json",
        "--setting-sources", "",
        "--dangerously-skip-permissions",
        "--no-session-persistence",
        "--system-prompt", system_prompt,
    ]

    if tier == "C":
        mcp_config_path = str(TESTS_DIR / "mcp-config.json")
        cmd.extend(["--mcp-config", mcp_config_path])
    else:
        cmd.extend(["--tools", "Bash"])

    cmd.append(prompt)

    start_time = time.time()

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TEST_TIMEOUT,
            cwd="/tmp",
        )
    except subprocess.TimeoutExpired:
        elapsed = time.time() - start_time
        return {
            "output": f"[TIMEOUT after {TEST_TIMEOUT}s]",
            "exit_code": -1,
            "elapsed_seconds": round(elapsed, 1),
            "cost_usd": None,
            "num_turns": None,
            "error": "timeout",
        }
    except FileNotFoundError:
        return {
            "output": "[ERROR] claude CLI not found",
            "exit_code": -1,
            "elapsed_seconds": 0,
            "cost_usd": None,
            "num_turns": None,
            "error": "cli_not_found",
        }

    elapsed = time.time() - start_time

    result = {
        "output": "",
        "exit_code": proc.returncode,
        "elapsed_seconds": round(elapsed, 1),
        "cost_usd": None,
        "num_turns": None,
        "error": None,
    }

    if proc.returncode != 0:
        result["output"] = f"[ERROR] {proc.stderr[:500]}"
        result["error"] = "nonzero_exit"
        return result

    # Parse JSON output from claude --output-format json
    try:
        output = json.loads(proc.stdout)
        result["output"] = output.get("result", proc.stdout[:5000])
        result["cost_usd"] = output.get("cost_usd")
        result["num_turns"] = output.get("num_turns")
    except json.JSONDecodeError:
        result["output"] = proc.stdout[:5000]

    return result


# ---------------------------------------------------------------------------
# Verify runner
# ---------------------------------------------------------------------------


def verify_process(
    process: dict,
    captures: dict[str, str],
    token: str,
) -> list[dict]:
    """
    For each action in the process, run the search and check assertions.

    Captures are accumulated across actions (mutable dict).
    All actions are always verified — failures do NOT block subsequent actions.
    This ensures captures (record IDs) are collected for teardown.
    """
    action_results = []

    for action in process["actions"]:
        action_id = action["id"]

        verify = action["verify"]
        endpoint = verify["endpoint"]
        search_body = verify.get("search")

        # Step 1: Execute the search
        status, response = hubspot_api(token, "POST", endpoint, body=search_body)

        if status != 200 or not response or response.get("total", 0) == 0:
            action_results.append({
                "id": action_id,
                "result": "fail",
                "evidence": f"Search returned no results (status={status})",
                "gap": "skill_recipe",
            })
            continue

        # Pick the most recently created record (last created = most likely
        # to be the intended one, avoids stale/duplicate matches)
        records = response["results"]
        records.sort(
            key=lambda r: r.get("properties", {}).get("createdate", ""),
            reverse=True,
        )
        record = records[0]
        record_id = str(record["id"])
        record_properties = record.get("properties", {})

        # Step 2: Run captures (always, even if assertions fail)
        for var_name, jsonpath in verify.get("capture", {}).items():
            value = extract_jsonpath(response, jsonpath)
            if value is not None:
                captures[var_name] = value

        # Step 3: Determine source object type from endpoint
        # Endpoint pattern: /crm/v3/objects/{type}/search
        parts = endpoint.strip("/").split("/")
        source_type = parts[3] if len(parts) > 3 else "unknown"

        # Step 4: Evaluate assertions
        all_passed = True
        evidence_parts = []

        for assertion in verify.get("assertions", []):
            passed, evidence = evaluate_assertion(
                assertion=assertion,
                record_properties=record_properties,
                captures=captures,
                record_id=record_id,
                source_object_type=source_type,
                token=token,
            )
            evidence_parts.append(("PASS" if passed else "FAIL") + ": " + evidence)
            if not passed:
                all_passed = False

        if all_passed:
            action_results.append({
                "id": action_id,
                "result": "pass",
                "evidence": "; ".join(evidence_parts),
            })
        else:
            action_results.append({
                "id": action_id,
                "result": "fail",
                "evidence": "; ".join(evidence_parts),
                "gap": "skill_recipe",
            })

    return action_results


# ---------------------------------------------------------------------------
# Teardown runner
# ---------------------------------------------------------------------------


def run_teardown(
    process: dict,
    captures: dict[str, str],
    token: str,
) -> list[dict]:
    """
    Execute teardown API calls using captured IDs.
    Always runs regardless of pass/fail.
    If a captured ID is missing, attempts a fallback search for [TEST] records.
    """
    teardown_results = []
    teardown = process.get("teardown", {})

    for call in teardown.get("api_calls", []):
        endpoint = resolve_captures(call["endpoint"], captures)
        method = call["method"]
        call_id = call.get("id", "unknown")

        # If endpoint still has unresolved placeholders, try fallback search
        if re.search(r"\{\w+\}", endpoint):
            fallback_results = _fallback_teardown(call, captures, token)
            teardown_results.extend(fallback_results)
            continue

        status, _ = hubspot_api(token, method, endpoint)
        teardown_results.append({
            "id": call_id,
            "result": "ok" if status in (200, 204) else "error",
            "status_code": status,
            "endpoint": endpoint,
        })

    return teardown_results


# Map from teardown call IDs to (object_type, search_field) for fallback search
_TEARDOWN_FALLBACK_MAP = {
    "delete_contact": ("contacts", "email", "testacmefoods"),
    "delete_company": ("companies", "name", "[TEST]"),
    "delete_deal": ("deals", "dealname", "[TEST]"),
    "delete_note": ("notes", "hs_note_body", "[TEST]"),
    "delete_call": ("calls", "hs_call_title", "[TEST]"),
    "delete_brand": ("0-970", "buyer_name", "[TEST]"),
}


def _fallback_teardown(
    call: dict,
    captures: dict[str, str],
    token: str,
) -> list[dict]:
    """
    When a teardown endpoint has unresolved placeholders, search for [TEST]
    records by object type and delete any matches.
    """
    call_id = call.get("id", "unknown")

    # Determine object type from the endpoint pattern: /crm/v3/objects/{type}/{id}
    endpoint = call["endpoint"]
    parts = endpoint.strip("/").split("/")
    if len(parts) >= 4:
        object_type = parts[3]
    else:
        return [{
            "id": call_id,
            "result": "skipped",
            "evidence": f"Cannot determine object type from endpoint: {endpoint}",
        }]

    # Determine search field based on object type
    search_field_map = {
        "contacts": "email",
        "companies": "name",
        "deals": "dealname",
        "notes": "hs_note_body",
        "calls": "hs_call_title",
        "0-162": "hs_name",
        "0-410": "hs_course_name",
        "0-420": "hs_name",
        "0-970": "buyer_name",
    }
    search_field = search_field_map.get(object_type, "name")

    # Search for [TEST] records
    search_body = {
        "filterGroups": [{
            "filters": [{
                "propertyName": search_field,
                "operator": "CONTAINS_TOKEN",
                "value": "TEST",
            }]
        }],
        "properties": [search_field],
        "limit": 20,
    }

    status, response = hubspot_api(
        token, "POST", f"/crm/v3/objects/{object_type}/search", body=search_body,
    )

    if status != 200 or not response:
        return [{
            "id": call_id,
            "result": "skipped",
            "evidence": f"Fallback search failed (status={status})",
        }]

    results_list = []
    records = response.get("results", [])
    test_records = [
        r for r in records
        if "[TEST]" in str(r.get("properties", {}).get(search_field, ""))
    ]

    if not test_records:
        return [{
            "id": call_id,
            "result": "skipped",
            "evidence": f"Fallback search found no [TEST] {object_type} records",
        }]

    for record in test_records:
        record_id = record["id"]
        del_endpoint = f"/crm/v3/objects/{object_type}/{record_id}"
        del_status, _ = hubspot_api(token, "DELETE", del_endpoint)
        results_list.append({
            "id": f"{call_id}_fallback_{record_id}",
            "result": "ok" if del_status in (200, 204) else "error",
            "status_code": del_status,
            "endpoint": del_endpoint,
            "evidence": f"Fallback: deleted {object_type}/{record_id}",
        })

    return results_list


# ---------------------------------------------------------------------------
# Results writer
# ---------------------------------------------------------------------------


def save_result(
    run_id: str,
    process_id: str,
    tier: str,
    result: str,
    action_results: list[dict],
    plugin_output: str,
    elapsed_seconds: float,
    cost_usd: float | None,
    teardown_results: list[dict],
) -> Path:
    """Write a JSON result file to tests/runs/."""
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    data = {
        "run_id": run_id,
        "process_id": process_id,
        "tier": tier,
        "timestamp": datetime.now().isoformat(),
        "result": result,
        "actions": action_results,
        "teardown": teardown_results,
        "plugin_output": plugin_output,
        "elapsed_seconds": elapsed_seconds,
        "cost_usd": cost_usd,
    }

    filename = f"{run_id}_{process_id}_tier-{tier}.json"
    filepath = RUNS_DIR / filename

    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, default=str)

    return filepath


# ---------------------------------------------------------------------------
# Main CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Workflow Test Harness — verifies plugin CRM workflows against live HubSpot"
    )
    parser.add_argument(
        "--process",
        help="Run only this process ID (e.g., contact.create)",
    )
    parser.add_argument(
        "--tier",
        action="append",
        choices=["A", "B", "C"],
        help="Run only this tier (can repeat; default: both A and B)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would run without executing",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    args = parser.parse_args()

    # --- Check environment ---
    token = os.environ.get("HUBSPOT_TOKEN", "")
    if not token and not args.dry_run:
        print("ERROR: Set HUBSPOT_TOKEN environment variable")
        print("  export HUBSPOT_TOKEN='pat-eu1-...'")
        sys.exit(1)

    if not REGISTRY_PATH.exists():
        print(f"ERROR: Process registry not found at {REGISTRY_PATH}")
        sys.exit(1)

    # Check claude CLI
    if not args.dry_run:
        try:
            subprocess.run(
                ["claude", "--version"],
                capture_output=True, check=True, timeout=10,
            )
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            print(f"ERROR: 'claude' CLI not available: {e}")
            sys.exit(1)

    # --- Load registry ---
    with open(REGISTRY_PATH) as f:
        registry = json.load(f)

    processes = registry["processes"]

    # Filter by --process
    if args.process:
        processes = [p for p in processes if p["id"] == args.process]
        if not processes:
            print(f"ERROR: Unknown process '{args.process}'")
            available = [p["id"] for p in registry["processes"]]
            print(f"Available: {', '.join(available)}")
            sys.exit(1)

    tiers = args.tier if args.tier else ["A", "B"]
    run_id = datetime.now().strftime("%Y-%m-%d_%H%M")

    # --- Print test plan ---
    num_tests = len(tiers) * len(processes)
    print(f"{'='*60}")
    print(f"Workflow Test Harness")
    print(f"{'='*60}")
    print(f"Processes: {', '.join(p['id'] for p in processes)}")
    print(f"Tiers:     {', '.join(tiers)}")
    print(f"Total:     {num_tests} test(s)")
    print(f"Model:     {MODEL}")
    print(f"Run ID:    {run_id}")

    if args.dry_run:
        print(f"\n[DRY RUN MODE]\n")
        for tier in tiers:
            for process in processes:
                sp = build_system_prompt(tier, token or "TOKEN_PLACEHOLDER")
                print(f"  {process['id']} | Tier {tier}")
                print(f"    Prompt:        {process['prompt'][:80]}...")
                print(f"    System prompt: {len(sp)} chars")
                print(f"    Actions:       {len(process['actions'])}")
                print()
        print("Dry run complete. No tests executed.")
        return

    # Confirm before running
    if not args.yes:
        print(f"\nPress Enter to start, or Ctrl+C to cancel...")
        try:
            input()
        except KeyboardInterrupt:
            print("\nCancelled.")
            sys.exit(0)

    # --- Run tests ---
    summary = []

    for tier in tiers:
        print(f"\n{'#'*60}")
        print(f"# TIER {tier}")
        print(f"{'#'*60}")

        # Pre-tier cleanup: delete any lingering [TEST] records from previous runs
        print(f"\n  Pre-cleanup: searching for stale [TEST] records...")
        for obj_type, field in [("calls", "hs_call_title"), ("notes", "hs_note_body"), ("0-162", "hs_name"), ("0-410", "hs_course_name"), ("0-420", "hs_name"), ("0-970", "buyer_name"), ("deals", "dealname"), ("contacts", "email"), ("companies", "name")]:
            search_body = {
                "filterGroups": [{"filters": [{"propertyName": field, "operator": "CONTAINS_TOKEN", "value": "TEST"}]}],
                "properties": [field],
                "limit": 50,
            }
            status, response = hubspot_api(token, "POST", f"/crm/v3/objects/{obj_type}/search", body=search_body)
            if status == 200 and response:
                stale = [r for r in response.get("results", []) if "[TEST]" in str(r.get("properties", {}).get(field, "")).upper()
                         or "[test]" in str(r.get("properties", {}).get(field, "")).lower()]
                for rec in stale:
                    del_status, _ = hubspot_api(token, "DELETE", f"/crm/v3/objects/{obj_type}/{rec['id']}")
                    print(f"    Deleted stale {obj_type}/{rec['id']} ({del_status})")
        print(f"  Pre-cleanup done.")

        for process in processes:
            process_id = process["id"]
            captures: dict[str, str] = {}

            print(f"\n--- {process_id} (Tier {tier}) ---")

            # 1. Execute
            print(f"  Executing Claude session...")
            system_prompt = build_system_prompt(tier, token)
            claude_result = execute_claude_session(
                prompt=process["prompt"],
                system_prompt=system_prompt,
                tier=tier,
            )

            print(f"  Claude finished in {claude_result['elapsed_seconds']}s "
                  f"(exit={claude_result['exit_code']})")

            if claude_result["error"]:
                print(f"  ERROR: {claude_result['error']}")

            # 2. Wait for HubSpot indexing
            print(f"  Waiting {VERIFY_DELAY}s for HubSpot indexing...")
            time.sleep(VERIFY_DELAY)

            # 3. Verify
            print(f"  Verifying actions...")
            action_results = verify_process(process, captures, token)

            for ar in action_results:
                status = ar["result"].upper()
                print(f"    [{status}] {ar['id']}: {ar['evidence'][:100]}")

            # 4. Teardown
            print(f"  Running teardown...")
            teardown_results = run_teardown(process, captures, token)

            for tr in teardown_results:
                print(f"    [{tr['result'].upper()}] {tr['id']}")

            # 5. Save
            passed_count = sum(1 for a in action_results if a["result"] == "pass")
            total_count = len(process["actions"])
            overall = "pass" if passed_count == total_count else "fail"

            filepath = save_result(
                run_id=run_id,
                process_id=process_id,
                tier=tier,
                result=overall,
                action_results=action_results,
                plugin_output=claude_result["output"],
                elapsed_seconds=claude_result["elapsed_seconds"],
                cost_usd=claude_result.get("cost_usd"),
                teardown_results=teardown_results,
            )

            print(f"  Result: {overall.upper()} ({passed_count}/{total_count} actions)")
            print(f"  Saved:  {filepath}")

            summary.append({
                "process": process_id,
                "tier": tier,
                "result": overall,
                "passed": passed_count,
                "total": total_count,
                "time": claude_result["elapsed_seconds"],
            })

    # --- Final summary ---
    print(f"\n{'='*60}")
    print(f"RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"{'Process':<25} {'Tier':<6} {'Result':<8} {'Time':<8} {'Actions'}")
    print(f"{'-'*25} {'-'*5} {'-'*7} {'-'*7} {'-'*10}")

    for s in summary:
        print(f"{s['process']:<25} {s['tier']:<6} {s['result'].upper():<8} "
              f"{s['time']:<7.1f}s {s['passed']}/{s['total']} passed")

    print(f"{'='*60}")
    print(f"Results saved to: {RUNS_DIR}")


if __name__ == "__main__":
    main()
