# HubSpot CRM Workflow Test Harness

Automated testing framework for verifying CRM workflow execution through isolated Claude sessions against live HubSpot data.

## How It Works

The test harness executes CRM workflows in four phases:

### Execution Phases

1. **Pre-cleanup** — Searches for and deletes stale `[TEST]` records from previous runs across all object types
2. **Execute** — Spawns isolated Claude session with workflow prompt and executes via `claude` CLI
3. **Verify** — Waits for HubSpot indexing, then runs searches and evaluates assertions against live API data
4. **Teardown** — Deletes test records using captured IDs; falls back to search-based cleanup if IDs are missing

### Tier System

Tests run in two tiers to measure skill impact:

- **Tier A (raw)** — Base prompt + curl templates + HUBSPOT_TOKEN only
- **Tier B (skill)** — Base prompt + curl templates + HUBSPOT_TOKEN + SKILL.md loaded
- **Tier C (MCP)** — Base prompt + SKILL.md + MCP tools (no raw token in prompt)

All tiers execute the same workflow. Comparing results shows skill and transport effectiveness.

## Running Tests

### Prerequisites

```bash
# 1. Install and authenticate claude CLI
claude --version

# 2. Set HubSpot token
export HUBSPOT_TOKEN='pat-eu1-...'

# 3. Python 3.x installed
python3 --version
```

### CLI Commands

```bash
# Run all processes, both tiers (requires confirmation prompt)
python3 tests/test_harness.py

# Run all processes, skip confirmation
python3 tests/test_harness.py --yes

# Run single process
python3 tests/test_harness.py --process buyer.onboard

# Run single tier across all processes
python3 tests/test_harness.py --tier A

# Run explicit tiers
python3 tests/test_harness.py --tier A --tier B

# Preview what would run (no execution)
python3 tests/test_harness.py --dry-run

# Run MCP tier (requires running MCP server)
python3 tests/test_harness.py --tier C

# Combine flags
python3 tests/test_harness.py --process buyer.pipeline_progression --tier B --yes
```

## Process Registry

Workflows are defined in `tests/process_registry.json`. Each process represents a complete CRM workflow with verification and cleanup.

### Schema

```json
{
  "id": "buyer.onboard",
  "category": "buyer_management",
  "name": "Human-readable workflow name",
  "trigger": "Context for when this workflow would be used",
  "prompt": "Full workflow instruction given to Claude",
  "actions": [
    {
      "id": "create_company",
      "description": "What this action does",
      "verify": {
        "method": "search",
        "endpoint": "/crm/v3/objects/companies/search",
        "search": {
          "filterGroups": [...],
          "properties": ["name", "domain"],
          "sorts": [{"propertyName": "createdate", "direction": "DESCENDING"}]
        },
        "capture": {
          "company_id": "$.results[0].id"
        },
        "assertions": [
          {"field": "name", "operator": "contains", "value": "Greenleaf"},
          {"field": "domain", "operator": "eq", "value": "testgreenleafgrocers.com"}
        ]
      }
    }
  ],
  "teardown": {
    "description": "Cleanup strategy",
    "api_calls": [
      {
        "id": "delete_company",
        "method": "DELETE",
        "endpoint": "/crm/v3/objects/companies/{company_id}"
      }
    ]
  }
}
```

### Key Fields

- **id** — Unique process identifier (e.g., `buyer.onboard`)
- **trigger** — When this workflow would be used (helps Claude understand context)
- **prompt** — Full workflow instruction passed to Claude session
- **actions[].verify.endpoint** — HubSpot search API endpoint
- **actions[].verify.search** — Search body sent to endpoint
- **actions[].verify.capture** — JSONPath expressions to extract IDs for teardown
- **actions[].verify.assertions** — Verification conditions (see Assertion Operators below)
- **teardown.api_calls** — DELETE calls using captured IDs (supports variable interpolation)

## Assertion Operators

All assertions evaluate against HubSpot record properties returned by search APIs.

### `eq` — Exact match (case-insensitive)

Checks field value equals expected value exactly.

```json
{"field": "domain", "operator": "eq", "value": "testgreenleafgrocers.com"}
```

**Evidence**: `'domain' = 'testgreenleafgrocers.com'`

### `contains` — Substring match (case-insensitive)

Checks field value contains expected substring.

```json
{"field": "name", "operator": "contains", "value": "Greenleaf"}
```

**Evidence**: `'name' contains 'Greenleaf'`

### `not_null` — Field is set

Checks field exists and has non-empty value.

```json
{"field": "createdate", "operator": "not_null", "value": ""}
```

**Evidence**: `'createdate' is set ('2024-03-26T10:15:30Z')`

**Failure**: `'createdate' is null or empty`

### `associated_to` — Association exists

Checks record is associated to another record. Requires additional fields `object_type` and `value` (supports variable interpolation).

```json
{
  "field": "associations",
  "operator": "associated_to",
  "object_type": "companies",
  "value": "{company_id}"
}
```

**Evidence**: `contacts/12345 associated to companies/67890`

**Failure**: `contacts/12345 NOT associated to companies/67890 (found: [11111, 22222])`

Uses HubSpot associations API: `/crm/v3/objects/{source_type}/{record_id}/associations/{object_type}`

### `timestamps_chronological` — Multiple timestamps in order

Checks multiple timestamp fields are all non-null and in chronological order. Field value is semicolon-separated list.

```json
{
  "field": "hs_v2_date_entered_4443390193;hs_v2_date_entered_4443390194;hs_v2_date_entered_4443390195",
  "operator": "timestamps_chronological",
  "value": ""
}
```

**Evidence**: `Stages entered in order: Discovery → Follow Up → Feedback Pending`

**Failure**: `Out of order: 'hs_v2_date_entered_4443390194' (2024-03-26T12:00:00Z) > 'hs_v2_date_entered_4443390195' (2024-03-26T11:00:00Z)`

**Failure**: `'hs_v2_date_entered_4443390195' is null — stage was never entered`

## Adding a New Test

### Step 1: Define the process

Add entry to `process_registry.json`:

```json
{
  "id": "contact.create",
  "category": "contact_management",
  "name": "Create a contact",
  "trigger": "Operator needs to add a new contact to HubSpot",
  "prompt": "Create a contact called '[TEST] Jane Smith' with email jane.smith@testacmefoods.com. Set her job title to 'Buyer' and lifecycle stage to 'lead'.",
  "actions": [],
  "teardown": {"api_calls": []}
}
```

### Step 2: Define actions with verify conditions

```json
"actions": [
  {
    "id": "create_contact",
    "description": "Create the contact with provided properties",
    "verify": {
      "method": "search",
      "endpoint": "/crm/v3/objects/contacts/search",
      "search": {
        "filterGroups": [{
          "filters": [{
            "propertyName": "email",
            "operator": "EQ",
            "value": "jane.smith@testacmefoods.com"
          }]
        }],
        "properties": ["firstname", "lastname", "email", "jobtitle", "lifecyclestage"]
      },
      "capture": {
        "contact_id": "$.results[0].id"
      },
      "assertions": [
        {"field": "firstname", "operator": "eq", "value": "Jane"},
        {"field": "lastname", "operator": "eq", "value": "Smith"},
        {"field": "email", "operator": "eq", "value": "jane.smith@testacmefoods.com"},
        {"field": "jobtitle", "operator": "eq", "value": "Buyer"},
        {"field": "lifecyclestage", "operator": "eq", "value": "lead"}
      ]
    }
  }
]
```

### Step 3: Define teardown

```json
"teardown": {
  "description": "Delete test contact",
  "api_calls": [
    {
      "id": "delete_contact",
      "method": "DELETE",
      "endpoint": "/crm/v3/objects/contacts/{contact_id}"
    }
  ]
}
```

### Step 4: Test with dry-run

```bash
python3 tests/test_harness.py --process contact.create --dry-run
```

Review prompt, system prompt, and action count.

### Step 5: Run the test

```bash
python3 tests/test_harness.py --process contact.create --tier B --yes
```

### Step 6: Review results

Check `tests/runs/{timestamp}_contact.create_tier-B.json` for verification evidence and gaps.

## Interpreting Results

Results are saved to `tests/runs/{run_id}_{process_id}_tier-{tier}.json`.

### Result Structure

```json
{
  "run_id": "2024-03-26_1015",
  "process_id": "buyer.onboard",
  "tier": "B",
  "timestamp": "2024-03-26T10:15:30.123456",
  "result": "pass",
  "actions": [
    {
      "id": "create_company",
      "result": "pass",
      "evidence": "PASS: 'name' contains 'Greenleaf'; PASS: 'domain' = 'testgreenleafgrocers.com'"
    },
    {
      "id": "create_contact_and_associate",
      "result": "fail",
      "evidence": "PASS: 'firstname' = 'Tom'; FAIL: contacts/12345 NOT associated to companies/67890",
      "gap": "skill_recipe"
    }
  ],
  "teardown": [
    {
      "id": "delete_contact",
      "result": "ok",
      "status_code": 204,
      "endpoint": "/crm/v3/objects/contacts/12345"
    }
  ],
  "plugin_output": "Full Claude session output...",
  "elapsed_seconds": 45.2,
  "cost_usd": 0.023
}
```

### Result Fields

- **result** — Overall test result: `pass` (all actions passed) or `fail` (one or more actions failed)
- **actions[].result** — Action result: `pass` or `fail`
- **actions[].evidence** — Semicolon-separated list of assertion results with PASS/FAIL prefix
- **actions[].gap** — Gap classification if action failed (see Gap Classifications below)
- **teardown[].result** — `ok` (status 200/204), `error` (other status), or `skipped` (ID not captured)

### Gap Classifications

When an action fails, the harness assigns a gap classification to categorize the root cause:

- **skill_recipe** — Skill instructions incomplete or incorrect (most common; means skill needs improvement)
- **skill_iron_law** — Skill violated iron law (e.g., insufficient verification before asserting completion)
- **skill_object_id** — Skill failed to capture or use object IDs correctly
- **plugin_limitation** — Plugin/tool limitation prevented execution
- **hubspot_limitation** — HubSpot API limitation or workflow quirk

Default gap classification is `skill_recipe`. Manually review failures and re-classify in result JSON if needed.

## Configuration

Edit these constants in `test_harness.py`:

### `MODEL`

```python
MODEL = "opus"
```

Claude model ID passed to `claude` CLI. Options: `opus`, `sonnet`, `haiku`, or full model IDs like `claude-opus-4-5-20251101`.

### `TEST_TIMEOUT`

```python
TEST_TIMEOUT = 600  # seconds
```

Maximum duration for each Claude session. Session is killed and marked as timeout error if exceeded.

### `VERIFY_DELAY`

```python
VERIFY_DELAY = 5  # seconds
```

Wait time after Claude session completes before running verification searches. Allows HubSpot indexing to catch up. Increase if verification consistently fails to find recently created records.

### File Paths

```python
REGISTRY_PATH = TESTS_DIR / "process_registry.json"
RUNS_DIR = TESTS_DIR / "runs"
SKILL_PATH = PROJECT_ROOT / "plugins" / "pluginbrands-toolkit" / "skills" / "hubspot-api-query" / "SKILL.md"
```

Defaults work for standard project structure. Modify if files are relocated.

---

**Test harness version**: 1.0
**Last updated**: 2024-03-26
