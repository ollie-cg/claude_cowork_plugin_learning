# Workflow Test Harness Design

## Purpose

A framework to systematically test whether the plugin can execute every core CRM workflow correctly. Map each workflow, test it against live HubSpot, score pass/fail, and identify what needs to change in the skill.

## Three Layers

### Layer 1 — Process Registry

A structured catalogue of every workflow the plugin needs to handle. Stored in `process_registry.json`.

Each process defines:
- **id** — unique key (e.g. `buyer.create_deal`)
- **category** — group (e.g. `buyer_management`, `client_management`, `product_operations`, `activity_logging`, `data_quality`)
- **name** — human-readable label
- **trigger** — when this happens in real life
- **actions** — ordered list of atomic CRM operations, each with:
  - **id** — unique within the process
  - **description** — what the action does
  - **verify** — what must be true for this action to pass

Categories:
1. Buyer management
2. Client management
3. Product operations
4. Activity logging
5. Data quality checks

The registry is built with the client. It changes rarely.

### Layer 2 — Test Protocol

For each process, a test that exercises it against live HubSpot using a `[TEST]` naming convention for isolation. Every test follows four phases:

**Setup** — Create prerequisite records via direct API calls (not through the plugin). Example: testing "move deal to Won" requires a deal to exist first. All records use `[TEST]` prefix.

**Execute** — Spawn an isolated Claude session with the skill loaded. Give it a prompt describing the workflow to perform. Capture full output.

**Verify** — For each action in the process definition, hit the HubSpot API and check: record exists, right pipeline, right stage, right associations, expected fields populated. Pass the plugin output and API evidence to a judge LLM. Each action gets **pass** or **fail**.

**Teardown** — Search HubSpot for all records with `[TEST]` in the name. Delete them. Runs regardless of outcome.

### Layer 3 — Evaluation & Gap Analysis

When a process fails, each failing action gets a `gap` classification:

| Gap type | Meaning | Fix |
|----------|---------|-----|
| `skill_recipe` | Skill lacks a recipe for this workflow | Add a query recipe to the skill |
| `skill_iron_law` | Plugin does something the skill should prevent | Add an iron law or red flag |
| `skill_object_id` | Plugin can't find the right object/pipeline | Add IDs to the skill reference tables |
| `plugin_limitation` | Plugin fundamentally can't do this action | Requires tooling or architecture change |
| `hubspot_limitation` | HubSpot API doesn't support this operation | Workaround or accept the gap |

Results feed directly into skill development: fix the gap, re-run the test, confirm it passes.

## Storage

```
process_registry.json          # Process definitions (Layer 1)
runs/
  2026-03-23_1400_buyer.create_deal.json   # One file per process per run
  2026-03-23_1400_buyer.move_stage.json
  2026-03-23_1405_buyer.create_deal.json   # Re-run after skill change
```

### process_registry.json

```json
{
  "processes": [
    {
      "id": "buyer.create_deal",
      "category": "buyer_management",
      "name": "Create a new buyer deal",
      "trigger": "Operator identifies a new target buyer",
      "actions": [
        {
          "id": "create_company",
          "description": "Create or find the buyer company",
          "verify": "Company exists with [TEST] prefix name"
        },
        {
          "id": "create_deal",
          "description": "Create deal in Buyer Deal Pipeline at Discovery stage",
          "verify": "Deal exists, pipeline=2760762586, stage=Discovery, associated to company"
        },
        {
          "id": "confirm_brands_created",
          "description": "Confirm workflow auto-created Brand records",
          "verify": "Brand records exist linking deal to client brands"
        }
      ]
    }
  ]
}
```

### Run result file

```json
{
  "run_id": "2026-03-23_1400",
  "process_id": "buyer.create_deal",
  "timestamp": "2026-03-23T14:00:00Z",
  "result": "fail",
  "actions": [
    {
      "id": "create_company",
      "result": "pass",
      "evidence": "Company 12345 created with name [TEST] Acme Retail"
    },
    {
      "id": "create_deal",
      "result": "fail",
      "evidence": "Deal created but in wrong pipeline (used legacy pipeline)",
      "gap": "skill_recipe"
    },
    {
      "id": "confirm_brands_created",
      "result": "fail",
      "evidence": "Not tested — blocked by previous failure",
      "gap": "skill_recipe"
    }
  ],
  "plugin_output": "Full captured output from the Claude session...",
  "ai_evaluation": "Plugin created the company correctly but placed the deal in a legacy client-specific pipeline rather than the Buyer Deal Pipeline. The skill needs a recipe specifying which pipeline ID to use for buyer deals."
}
```

## Judge

Each action gets one result: **pass** or **fail**.

The harness verifies via HubSpot API calls after the plugin executes. A judge LLM then reviews the full plugin output against the process definition to catch problems the API checks missed (wrong reasoning, skipped steps, bad approach). The judge can flip a pass to a fail.

Process-level result: all actions pass = **pass**, any action fails = **fail**.

## Test Execution

The harness is a Python script (builds on the patterns in `test_harness.py`). It:

1. Reads `process_registry.json`
2. Accepts CLI args: `--process` (run one) or `--category` (run a group) or all
3. For each process: setup → execute → verify → teardown
4. Writes result to `runs/` directory
5. Prints summary table to stdout

The execute phase spawns an isolated Claude session:
```
claude --print --model opus --output-format json \
  --tools "Bash" \
  --setting-sources "" \
  --dangerously-skip-permissions \
  --no-session-persistence \
  --system-prompt "{base_prompt + skill}" \
  "{workflow_prompt}"
```

## Test Data Convention

- All test records use `[TEST]` prefix in their name
- Teardown searches for and deletes all `[TEST]` records across all object types
- If teardown fails, records can be manually found by searching `[TEST]` in HubSpot

## Decisions Made

- **No database** — JSON files only
- **Test in production** — using `[TEST]` prefix naming convention, not a sandbox
- **Pass/fail scoring** — no partial scores or weighted scales
- **Gap classification on failures** — feeds directly into skill development
- **Split storage** — registry is clean, runs accumulate separately
