#!/usr/bin/env python3
"""
LLM Scaffolding Test Harness (Claude Code CLI version)

Runs challenge prompts against Claude Opus via the `claude` CLI with
controlled context tiers. Uses your existing Claude Code subscription
— no additional API charges.

Isolation:
  --setting-sources ""       → ignores project/user settings, plugins, skills
  --tools "Bash"             → only Bash available (for curl to HubSpot)
  --system-prompt            → exactly the context we specify, nothing more
  --no-session-persistence   → no state carried between tests

Tiers:
  A (raw)         — generic assistant + HubSpot token only
  B (guide)       — above + system guide
  C (guide+skill) — above + system guide + specific skill

Usage:
  # Run all tiers, all prompts
  python3 test_harness.py

  # Run a single tier
  python3 test_harness.py --tier A

  # Run a single prompt by ID
  python3 test_harness.py --prompt A1

  # Run specific tier + prompt combo
  python3 test_harness.py --tier B --prompt A1

  # Dry run (show what would be sent, no API/CLI calls)
  python3 test_harness.py --dry-run

Requires:
  - `claude` CLI installed and authenticated
  - HUBSPOT_TOKEN environment variable (HubSpot PAT token)
"""

import json
import os
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
PROJECT_ROOT = Path(__file__).parent
SYSTEM_GUIDE_PATH = PROJECT_ROOT / "docs" / "hubspot-system-guide.md"
RESULTS_DIR = PROJECT_ROOT / "docs" / "test-results"

# Timeout per test (seconds) — Opus can be slow with multi-step tool use
TEST_TIMEOUT = 600

# ---------------------------------------------------------------------------
# Challenge prompts
# ---------------------------------------------------------------------------

CHALLENGE_PROMPTS = {
    # A: Data model comprehension
    "A1": {
        "category": "Data Model",
        "prompt": "Which companies are MOJU's active buyers? Show me the actual data from HubSpot.",
        "correct_approach": (
            "Query Brand records where client_name_sync = 'MOJU', "
            "filter by stage = 'Won', read buyer from Company association"
        ),
        "failure_modes": [
            "Confuses Company entity (no client/buyer flag) with Deal type",
            "Queries wrong entity",
            "Doesn't use Brand records"
        ]
    },
    "A2": {
        "category": "Data Model",
        "prompt": "How many products has MOJU placed at Farmer J? Get the real numbers from HubSpot.",
        "correct_approach": (
            "Find Brand record for MOJU/Farmer J, get associated Product Pitches "
            "at 'Product Placed' stage"
        ),
        "failure_modes": [
            "Uses products_placed rollup field (broken, always 0)",
            "Queries wrong entity"
        ]
    },
    "A3": {
        "category": "Data Model",
        "prompt": (
            "What's the difference between a Deal and a Brand in this HubSpot system? "
            "Look at the actual records to explain."
        ),
        "correct_approach": (
            "Deal = sales opportunity (two types). Brand = one client's products "
            "being pitched to one buyer. Brand sits below Deal."
        ),
        "failure_modes": [
            "Treats them as interchangeable",
            "Gets the hierarchy wrong"
        ]
    },
    "A4": {
        "category": "Data Model",
        "prompt": "Where do I find the nutritional data for MOJU products in HubSpot? Show me an example.",
        "correct_approach": (
            "Client Product entity, 67 properties including per-serving "
            "and per-100g nutritional fields"
        ),
        "failure_modes": [
            "Looks on Product Pitch (lightweight, 37 properties)",
            "Looks on Brand"
        ]
    },
    "A5": {
        "category": "Data Model",
        "prompt": "Show me all activity for the MOJU account this month from HubSpot.",
        "correct_approach": (
            "Multi-hop: Client Service -> Deals -> Meetings. "
            "Should flag that 11/14 MOJU deals have no meeting associations."
        ),
        "failure_modes": [
            "Assumes direct activity association exists",
            "Doesn't flag the known data gap"
        ]
    },

    # B: Workflow comprehension
    "B1": {
        "category": "Workflow",
        "prompt": (
            "Walk me through what happens in HubSpot when we onboard a new client. "
            "Check the system for examples of how existing clients were set up."
        ),
        "correct_approach": (
            "Client Service pipeline stages 0-4, product data entry "
            "(67 fields from client spreadsheets), Brand Induction"
        ),
        "failure_modes": [
            "Invents steps that don't exist",
            "Misses the data-heavy product import step"
        ]
    },
    "B2": {
        "category": "Workflow",
        "prompt": "How do I set up a new buyer pitch in HubSpot? What gets created automatically?",
        "correct_approach": (
            "Create buyer Deal -> workflow auto-creates Brand records -> "
            "create Product Pitches under each Brand"
        ),
        "failure_modes": [
            "Suggests creating Brand records manually",
            "Misses the automation"
        ]
    },

    # C: Query construction
    "C1": {
        "category": "Query",
        "prompt": (
            "Build me a pipeline status report for all clients. "
            "Pull the actual data from HubSpot and summarise it."
        ),
        "correct_approach": (
            "Brand records grouped by client_name_sync, then by pipeline stage, "
            "counting unique buyers per stage"
        ),
        "failure_modes": [
            "Queries Deals instead of Brands",
            "Misses that Brand = client/buyer intersection"
        ]
    },
    "C2": {
        "category": "Query",
        "prompt": (
            "Which products are we currently pitching but haven't placed yet? "
            "Get the data from HubSpot."
        ),
        "correct_approach": (
            "Product Pitch records at 'Proposed' or 'Negotiation' stage, "
            "joined to Client Product for details and Brand for buyer context"
        ),
        "failure_modes": [
            "Queries wrong entity",
            "Confuses Product Pitch stages with Brand stages"
        ]
    },
    "C3": {
        "category": "Query",
        "prompt": (
            "Get me a list of all contacts at buyers we've won deals with. "
            "Pull from HubSpot."
        ),
        "correct_approach": (
            "Deals at 'Won' stage in Buyer Deal Pipeline -> associated Companies "
            "-> associated Contacts"
        ),
        "failure_modes": [
            "Tries to filter Companies directly (no client/buyer flag)",
        ]
    },

    # D: Data quality awareness
    "D1": {
        "category": "Data Quality",
        "prompt": "How many products has MOJU placed total across all buyers? Give me the number from HubSpot.",
        "correct_approach": (
            "Queries Product Pitches at 'Product Placed' stage. "
            "Flags that the products_placed rollup on Brand shows 0 and shouldn't be trusted."
        ),
        "failure_modes": [
            "Uses the broken rollup field and reports 0",
            "Doesn't flag the data issue"
        ]
    },
    "D2": {
        "category": "Data Quality",
        "prompt": "Pull the financial summary for MOJU's pitches from HubSpot. Total values, averages, breakdown by buyer.",
        "correct_approach": (
            "Flags that amount fields are null across all Product Pitch and Brand records. "
            "States this data isn't available."
        ),
        "failure_modes": [
            "Hallucinates numbers",
            "Returns 0 without flagging the gap"
        ]
    },
    "D3": {
        "category": "Data Quality",
        "prompt": "How many meetings did we have with MOJU buyers this week? Get the real count from HubSpot.",
        "correct_approach": (
            "Returns what's available but flags the known association gap "
            "(11/14 deals have no meetings linked despite activity happening)"
        ),
        "failure_modes": [
            "Reports the count without the caveat",
            "Doesn't mention incomplete associations"
        ]
    },
}

# ---------------------------------------------------------------------------
# Skill content loader
# ---------------------------------------------------------------------------


def load_skill(skill_name: str) -> str | None:
    """Load a skill file by name from the plugins directory."""
    skill_path = (
        PROJECT_ROOT / "plugins" / "pluginbrands-toolkit"
        / "skills" / skill_name / "SKILL.md"
    )
    if skill_path.exists():
        return skill_path.read_text()
    return None


# ---------------------------------------------------------------------------
# System prompt builders
# ---------------------------------------------------------------------------


def build_system_prompt(tier: str, token: str,
                        skill_name: str | None = None) -> str:
    """Build the system prompt for a given context tier."""
    parts = []

    curl_reference = (
        "\n\n## Curl Reference\n\n"
        "```bash\n"
        "# List objects with properties\n"
        f"curl -s -H \"Authorization: Bearer {token}\" \\\n"
        "  \"https://api.hubapi.com/crm/v3/objects/{objectTypeId}?limit=100&properties=field1,field2\"\n\n"
        "# Search with filters\n"
        f"curl -s -X POST -H \"Authorization: Bearer {token}\" \\\n"
        "  -H \"Content-Type: application/json\" \\\n"
        "  \"https://api.hubapi.com/crm/v3/objects/{objectTypeId}/search\" \\\n"
        "  -d '{\"filterGroups\":[{\"filters\":[{\"propertyName\":\"field\",\"operator\":\"EQ\",\"value\":\"val\"}]}],\"properties\":[\"field1\"],\"limit\":100}'\n\n"
        "# Get associations\n"
        f"curl -s -H \"Authorization: Bearer {token}\" \\\n"
        "  \"https://api.hubapi.com/crm/v3/objects/{objectTypeId}/{recordId}/associations/{toObjectTypeId}\"\n\n"
        "# Get pipeline stages\n"
        f"curl -s -H \"Authorization: Bearer {token}\" \\\n"
        "  \"https://api.hubapi.com/crm/v3/pipelines/{objectTypeId}\"\n\n"
        "# Get all properties for an object type\n"
        f"curl -s -H \"Authorization: Bearer {token}\" \\\n"
        "  \"https://api.hubapi.com/crm/v3/properties/{objectTypeId}\"\n"
        "```"
    )

    base_prompt = (
        "You are an assistant that helps query and understand a HubSpot CRM system. "
        "You can use curl to make HubSpot API calls.\n\n"
        f"HubSpot API token: {token}\n"
        "HubSpot API base URL: https://api.hubapi.com\n\n"
        "Include the token as: -H 'Authorization: Bearer TOKEN'\n"
        "Always use: -H 'Content-Type: application/json'\n\n"
        "Be precise about which entities and fields you're querying and why. "
        "If data appears missing, broken, or inconsistent, say so explicitly."
        + curl_reference
    )

    if tier in ("C", "D"):
        # Enhanced base prompt for Tier C/D — reinforces skill compliance
        base_prompt = (
            "You are an assistant that helps query and understand the PluginBrands "
            "HubSpot CRM system. You can use curl to make HubSpot API calls.\n\n"
            f"HubSpot API token: {token}\n"
            "HubSpot API base URL: https://api.hubapi.com\n\n"
            "Include the token as: -H 'Authorization: Bearer TOKEN'\n"
            "Always use: -H 'Content-Type: application/json'\n\n"
            "IMPORTANT INSTRUCTIONS:\n"
            "1. You have been given an ACTIVE SKILL with the data model, object type IDs, "
            "and query recipes. Follow the skill precisely.\n"
            "2. Use the object type IDs provided in the skill and the curl templates below. "
            "Do NOT try to discover endpoints by exploration.\n"
            "3. Be precise about which entities and fields you're querying and why.\n"
            "4. If data appears missing, broken, or inconsistent, say so explicitly. "
            "Never silently omit null/zero values — flag them as data quality issues.\n"
            "5. Prefer Brand and Product Pitch records over legacy deal pipelines."
            + curl_reference
        )

    parts.append(base_prompt)

    if tier in ("B", "C"):
        guide_text = SYSTEM_GUIDE_PATH.read_text()
        parts.append("\n\n--- SYSTEM GUIDE ---\n\n")
        parts.append(guide_text)

    if tier in ("C", "D") and skill_name:
        skill_text = load_skill(skill_name)
        if skill_text:
            parts.append("\n\n--- ACTIVE SKILL ---\n\n")
            parts.append(skill_text)

    return "".join(parts)


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------


def run_single_test(
    prompt_id: str,
    tier: str,
    token: str,
    skill_name: str | None = None,
    dry_run: bool = False,
) -> dict:
    """Run a single challenge prompt via claude CLI and return the result."""

    challenge = CHALLENGE_PROMPTS[prompt_id]
    system_prompt = build_system_prompt(tier, token, skill_name)

    result = {
        "prompt_id": prompt_id,
        "tier": tier,
        "category": challenge["category"],
        "prompt": challenge["prompt"],
        "correct_approach": challenge["correct_approach"],
        "failure_modes": challenge["failure_modes"],
        "skill": skill_name,
        "model": MODEL,
        "timestamp": datetime.now().isoformat(),
    }

    print(f"\n{'='*60}")

    if dry_run:
        print(f"[DRY RUN] {prompt_id} | Tier {tier}")
        print(f"Category: {challenge['category']}")
        print(f"Prompt: {challenge['prompt']}")
        print(f"System prompt length: {len(system_prompt)} chars")
        print(f"Correct approach: {challenge['correct_approach']}")
        result["dry_run"] = True
        result["response"] = "[DRY RUN]"
        return result

    print(f"Running: {prompt_id} | Tier {tier} | {challenge['category']}")
    print(f"Prompt: {challenge['prompt'][:80]}...")

    # Build the claude CLI command
    cmd = [
        "claude",
        "--print",
        "--model", MODEL,
        "--output-format", "json",
        "--tools", "Bash",
        "--setting-sources", "",
        "--dangerously-skip-permissions",
        "--no-session-persistence",
        "--system-prompt", system_prompt,
        challenge["prompt"],
    ]

    start_time = time.time()

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TEST_TIMEOUT,
            cwd="/tmp",  # run from /tmp to avoid any project context
        )

        elapsed = time.time() - start_time
        result["elapsed_seconds"] = round(elapsed, 1)
        result["exit_code"] = proc.returncode

        if proc.returncode != 0:
            print(f"  ERROR (exit {proc.returncode}): {proc.stderr[:200]}")
            result["response"] = f"[ERROR] {proc.stderr[:500]}"
            result["raw_stderr"] = proc.stderr[:1000]
            return result

        # Parse JSON output
        try:
            output = json.loads(proc.stdout)
            result["response"] = output.get("result", proc.stdout[:2000])
            result["cost_usd"] = output.get("cost_usd", None)
            result["duration_ms"] = output.get("duration_ms", None)
            result["num_turns"] = output.get("num_turns", None)

            # Extract session stats if available
            if "usage" in output:
                result["usage"] = output["usage"]

        except json.JSONDecodeError:
            # Fall back to raw text
            result["response"] = proc.stdout[:5000]

        # Print summary
        print(f"  Time: {elapsed:.1f}s")
        if result.get("cost_usd"):
            print(f"  Cost: ${result['cost_usd']}")
        if result.get("num_turns"):
            print(f"  Turns: {result['num_turns']}")
        response_preview = result["response"]
        if isinstance(response_preview, str):
            print(f"  Response: {response_preview[:120]}...")

    except subprocess.TimeoutExpired:
        elapsed = time.time() - start_time
        result["elapsed_seconds"] = round(elapsed, 1)
        result["response"] = f"[TIMEOUT after {TEST_TIMEOUT}s]"
        print(f"  TIMEOUT after {TEST_TIMEOUT}s")

    except FileNotFoundError:
        print("  ERROR: 'claude' command not found. Is Claude Code CLI installed?")
        result["response"] = "[ERROR] claude CLI not found"

    return result


# ---------------------------------------------------------------------------
# Results writer
# ---------------------------------------------------------------------------


def save_results(results: list[dict], tier: str, run_id: str):
    """Save results to JSON and a human-readable markdown summary."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # JSON (full data)
    json_path = RESULTS_DIR / f"{run_id}_tier-{tier}.json"
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2, default=str)

    # Markdown summary
    md_path = RESULTS_DIR / f"{run_id}_tier-{tier}.md"
    with open(md_path, "w") as f:
        f.write(f"# Test Results — Tier {tier}\n\n")
        f.write(f"**Model:** {MODEL}\n")
        f.write(f"**Run ID:** {run_id}\n")
        f.write(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")

        total_cost = sum(r.get("cost_usd") or 0 for r in results)
        if total_cost:
            f.write(f"**Total cost:** ${total_cost:.4f}\n\n")

        f.write("---\n\n")

        for r in results:
            f.write(f"## {r['prompt_id']}: {r['category']}\n\n")
            f.write(f"**Prompt:** {r['prompt']}\n\n")
            f.write(f"**Correct approach:** {r['correct_approach']}\n\n")
            f.write(f"**Known failure modes:** {', '.join(r['failure_modes'])}\n\n")

            if r.get("elapsed_seconds"):
                f.write(f"**Time:** {r['elapsed_seconds']}s")
                if r.get("num_turns"):
                    f.write(f" | **Turns:** {r['num_turns']}")
                f.write("\n\n")

            f.write(f"**Response:**\n\n")
            response = r.get("response", "N/A")
            if isinstance(response, str):
                # Indent response as blockquote
                for line in response.split("\n"):
                    f.write(f"> {line}\n")
            else:
                f.write(f"> {json.dumps(response, indent=2)}\n")
            f.write("\n\n")

            # Scoring placeholders for manual review
            f.write("**Assessment:**\n\n")
            f.write("| Criterion | Score | Notes |\n")
            f.write("|-----------|-------|-------|\n")
            f.write("| Correct entity used? | _/5 | |\n")
            f.write("| Correct fields/properties? | _/5 | |\n")
            f.write("| Correct query path? | _/5 | |\n")
            f.write("| Data quality flagged? | _/5 | |\n")
            f.write("| Hallucination? | _/5 | |\n")
            f.write("| Overall | _/5 | |\n\n")
            f.write("---\n\n")

    print(f"\nResults saved:")
    print(f"  JSON: {json_path}")
    print(f"  Summary: {md_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="LLM Scaffolding Test Harness — Claude Code CLI version"
    )
    parser.add_argument(
        "--tier", choices=["A", "B", "C", "D"],
        help="Run only this tier (default: all)"
    )
    parser.add_argument(
        "--prompt",
        help="Run only this prompt ID, e.g. A1, D3 (default: all)"
    )
    parser.add_argument(
        "--skill", default=None,
        help="Skill name to load for Tier C (default: weekly-report)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be sent without running tests"
    )
    args = parser.parse_args()

    # Check environment
    token = os.environ.get("HUBSPOT_TOKEN", "")
    if not token and not args.dry_run:
        print("ERROR: Set HUBSPOT_TOKEN environment variable")
        print("  export HUBSPOT_TOKEN='pat-eu1-...'")
        sys.exit(1)

    if not SYSTEM_GUIDE_PATH.exists():
        print(f"ERROR: System guide not found at {SYSTEM_GUIDE_PATH}")
        sys.exit(1)

    # Check claude CLI is available
    if not args.dry_run:
        try:
            subprocess.run(["claude", "--version"], capture_output=True,
                           check=True, timeout=10)
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            print(f"ERROR: 'claude' CLI not available: {e}")
            sys.exit(1)

    # Determine what to run
    tiers = [args.tier] if args.tier else ["A", "B", "C", "D"]
    prompt_ids = [args.prompt] if args.prompt else list(CHALLENGE_PROMPTS.keys())

    # Validate prompt IDs
    for pid in prompt_ids:
        if pid not in CHALLENGE_PROMPTS:
            print(f"ERROR: Unknown prompt ID '{pid}'")
            print(f"Valid IDs: {', '.join(CHALLENGE_PROMPTS.keys())}")
            sys.exit(1)

    skill_name = args.skill or "hubspot-api-query"
    run_id = datetime.now().strftime("%Y-%m-%d_%H%M")

    num_tests = len(tiers) * len(prompt_ids)
    print(f"Test plan: {len(tiers)} tier(s) x {len(prompt_ids)} prompt(s) = {num_tests} tests")
    print(f"Model: {MODEL}")
    print(f"Cost: included in Claude Code subscription")
    print(f"Isolation: --setting-sources '' (no plugins, no project config)")
    print(f"Working dir: /tmp (no project files visible)")

    if not args.dry_run:
        print("\nPress Enter to start, or Ctrl+C to cancel...")
        try:
            input()
        except KeyboardInterrupt:
            print("\nCancelled.")
            sys.exit(0)

    # Run tests
    for tier in tiers:
        print(f"\n{'#'*60}")
        print(f"# TIER {tier}")
        print(f"{'#'*60}")

        tier_results = []
        for prompt_id in prompt_ids:
            result = run_single_test(
                prompt_id=prompt_id,
                tier=tier,
                token=token,
                skill_name=skill_name if tier in ("C", "D") else None,
                dry_run=args.dry_run,
            )
            tier_results.append(result)

            # Brief pause between tests
            if not args.dry_run:
                time.sleep(2)

        save_results(tier_results, tier, run_id)

    # Final summary
    print(f"\n{'='*60}")
    print("COMPLETE")
    print(f"Results directory: {RESULTS_DIR}")


if __name__ == "__main__":
    main()
