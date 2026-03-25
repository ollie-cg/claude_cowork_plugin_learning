# Implementation Plan

## Goal

Build a plugin that tests how well Claude handles real HubSpot CRM workflows for PluginBrands clients. The plugin is the deliverable — other agencies install it and run it against their own CRM.

## Architecture

Two separate concerns, kept apart:

```
plugins/pluginbrands-toolkit/       # The plugin (skills, commands, agents)
tests/                              # The test harness (tests the plugin)
```

The plugin is what the customer uses. The test harness is how we prove it works and iterate on it.

## Phases

### Phase 1 — Define workflows and build process registry (in progress)

Map CRM workflows and add them to `tests/process_registry.json` with actions and verify conditions.

**Process defined: `buyer.onboard`** — Full buyer onboarding workflow with 3 chained actions:

1. **Create company** — Set up the buyer company with name, domain, city, country, phone
2. **Create contact and associate** — Add a contact at the company with job title, department, email, phone, lifecycle stage; verify association to company
3. **Create buyer deal and associate** — Create a deal in the Buyer Deal Pipeline at Discovery stage with customer profile; verify association to company and that the calculated `buyer` field auto-populates

Test results (2026-03-24, run `1728`):

| Tier | Result | Time | Actions |
|------|--------|------|---------|
| A (no skill) | PASS | 67.3s | 3/3 |
| B (with skill) | PASS | 102.1s | 3/3 |

This workflow tests standard object creation (companies, contacts, deals), pipeline placement, and associations. Both tiers pass — the skill doesn't yet differentiate because these are standard HubSpot objects. Key learnings that fed back into the skill:

- `buyer` on deals is a **calculated read-only field** — auto-populates from associated company. Claude tried to set it directly, got a rejection, and created duplicate deals. Added to skill's Field Value Standards.
- `country` must be the full name `"United Kingdom"`, not `"UK"`. Added to skill's Field Value Standards.
- `customer_profile` has a fixed set of allowed values. Discovered during manual testing.

**Earlier process (`contact.create`)** — retired and merged into `buyer.onboard`. Originally tested company + contact creation as a 2-action process. Ran successfully on 2026-03-24 (run `1639`).

**Process defined: `buyer.onboard_with_engagements`** — Extends onboarding with engagement logging. 4 chained actions:

1. **Create company** — Set up buyer company with name, domain, city, country
2. **Create buyer deal and associate** — Deal in Buyer Deal Pipeline at Discovery, associated to company
3. **Create note on deal** — Meeting notes with specific content (terms, requirements), associated to deal
4. **Log call on deal** — Outbound completed call with transcript summary, associated to deal

Test results (2026-03-24, run `1752`):

| Tier | Result | Time | Actions |
|------|--------|------|---------|
| A (no skill) | PASS | 58.9s | 4/4 |
| B (with skill) | PASS | 67.2s | 4/4 |

This workflow tests standard object creation (companies, deals) plus engagement objects (notes, calls) with correct properties (call direction, status, duration) and associations. Both tiers pass — notes and calls are standard HubSpot objects, so the skill doesn't differentiate here. Tier B was ~8s slower due to processing the extra skill context without needing it.

Harness updates made for this process:
- Pre-cleanup loop now includes `notes` (by `hs_note_body`) and `calls` (by `hs_call_title`)
- Fallback teardown map extended with `notes` and `calls` object types
- Teardown order: engagements first (calls, notes), then parent records (deals, companies)

**Workflows still to define** (these will test where the skill actually matters — custom objects, specific pipelines, data quality traps):

- **Brand workflows** — Create Brand record (custom object `0-970`), track through pipeline
- **Product operations** — Create Product Pitch (`0-420`), link to Brand and Client Product
- **Pipeline progression** — Move a buyer deal through stages (Discovery → Follow Up → Won)
- **Data quality checks** — Queries that hit known traps (broken rollups, null amounts, duplicate Brands)

The skill proves its value on workflows involving custom objects and known data quality issues — that's where Tier A should fail and Tier B should pass.

### Phase 2 — Refactor the skill (transport-agnostic)

The skill currently mixes domain knowledge with curl examples. The skill should contain domain knowledge only (object IDs, pipelines, red flags, query recipes). The test harness already owns the curl transport layer (write-oriented curl templates are in the base prompt).

The skill also needs **write recipes** — it currently only covers querying. Creating contacts, companies, deals, and associations need to be covered.

Files to change:
- `plugins/pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md` — remove curl section, add write recipes
- Design doc: `docs/plans/2026-03-23-transport-agnostic-skill-design.md`

### Phase 3 — Build the test harness ✓

`tests/test_harness.py` reads `process_registry.json` and runs each workflow against live HubSpot. Two tiers:

- **Tier A** (raw) — base prompt + curl templates + token only
- **Tier B** (skill) — base prompt + curl templates + token + SKILL.md

Four phases per test:

1. **Pre-cleanup** — Search for and delete any stale `[TEST]` records (deals, contacts, companies) left by previous runs. Runs before each tier to prevent cross-contamination.
2. **Execute** — Spawn isolated Claude session with the workflow prompt. Capture full output.
3. **Verify** — Hit HubSpot API to check each action. All actions are always verified (failures do not block subsequent actions), ensuring record IDs are captured for teardown. When multiple records match a search, the most recently created is used.
4. **Teardown** — Delete records using captured IDs. If an ID wasn't captured, falls back to searching for `[TEST]` records by object type and deleting any matches.

Gap classification on failures:

| Gap type | Meaning | Fix |
|----------|---------|-----|
| `skill_recipe` | Skill lacks a recipe for this workflow | Add a query recipe |
| `skill_iron_law` | Plugin does something the skill should prevent | Add an iron law or red flag |
| `skill_object_id` | Plugin can't find the right object/pipeline | Add IDs to reference tables |
| `plugin_limitation` | Plugin fundamentally can't do this | Requires tooling change |
| `hubspot_limitation` | HubSpot API doesn't support it | Workaround or accept |

Storage:
```
tests/
├── process_registry.json
├── test_harness.py
└── runs/
    └── 2026-03-24_1728_buyer.onboard_tier-A.json
```

CLI:
```bash
python3 tests/test_harness.py                              # Run all
python3 tests/test_harness.py --process buyer.onboard      # Run one
python3 tests/test_harness.py --tier A                     # Single tier
python3 tests/test_harness.py --dry-run                    # Preview only
```

### Phase 4 — Run tests, iterate on the skill

Run the full suite. Read gap classifications. Fix the skill. Re-run. Track improvement across runs.

The loop:
1. Run harness → get results with gap classifications
2. For each `skill_recipe` / `skill_iron_law` / `skill_object_id` gap → edit SKILL.md
3. Re-run the failing processes
4. Repeat until all workflows pass

This is where the skill gets battle-tested against real CRM data.

### Phase 5 — Package as a plugin

The plugin (`plugins/pluginbrands-toolkit/`) gets published to a Claude Code / Cowork marketplace. Structure:

```
pluginbrands-toolkit/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── hubspot-api-query/
│       └── SKILL.md
├── commands/                    # If needed (e.g. /pluginbrands:test)
└── README.md
```

Distribution via GitHub repo. Other agencies install with:
```
/plugin marketplace add pluginbrands/pluginbrands-toolkit
```

### Phase 6 — End-to-end verification

Fresh machine test:
1. Clone the repo
2. Install the plugin
3. Set HubSpot token
4. Run the test harness
5. Confirm all workflows pass

## Decisions

- **No database** — JSON files only
- **Test in production** — `[TEST]` prefix convention, not a sandbox
- **Pass/fail scoring** — no partial scores
- **Two tiers** — A (no skill) and B (with skill). Old research tiers (A/B/C/D) retired
- **Non-blocking verification** — all actions are verified regardless of earlier failures, ensuring IDs are captured for cleanup
- **Fallback teardown** — if captured IDs are missing, the harness searches for `[TEST]` records by object type and deletes them
- **Pre-tier cleanup** — stale `[TEST]` records are deleted before each tier runs to prevent cross-contamination between runs
- **Newest-first matching** — when verification finds multiple matching records, the most recently created is used (handles duplicate creation from retries)
- **Automated verification** — harness checks assertions via HubSpot API after Claude finishes
- **Service key** — HubSpot authentication via service key (not private app)
- **Plugin and tests are separate** — plugin is the product, tests prove it works
