# Testing and Building a Scaffolding Framework for the HubSpot Environment

A process for measuring how well the LLM understands the PluginBrands HubSpot setup without skills, then systematically building skills to close the gaps.

---

## Overview

The process has two phases:

1. **Baseline testing** — probe the LLM's unassisted understanding of the HubSpot environment
2. **Skill development** — build targeted skills to fix the failures found in phase 1

Each phase follows a RED → GREEN → REFACTOR cycle. We test, observe failure, write minimal fixes, then test again.

---

## Test harness

Tests are run via `test_harness.py`, a script that spawns isolated `claude` CLI processes with controlled context. This uses the existing Claude Code subscription — no additional API charges.

### Isolation

The problem: running tests inside the project directory contaminates results. Claude Code auto-loads plugins, skills, `.claude/` settings, and CLAUDE.md files. The superpowers plugin injects workflow behaviours. We'd be measuring "LLM + all scaffolding" rather than the raw baseline.

The solution: each test spawns a fresh `claude` process with flags that strip all project context:

| Flag | What it blocks |
|------|---------------|
| `--setting-sources ""` | All user settings, project settings, plugins (including superpowers) |
| `--tools "Bash"` | Only Bash available — for curl to HubSpot. No Read, Glob, Grep, etc. |
| `--system-prompt "..."` | Exactly the context we specify, nothing from Claude Code's defaults |
| `--no-session-persistence` | No state carried between tests |
| `--dangerously-skip-permissions` | Allows unattended curl execution |
| `cwd="/tmp"` | Process runs from `/tmp` — no project files visible |

### Three context tiers

Each challenge prompt is run across three tiers. The **only** variable between tiers is what goes into the system prompt:

| Tier | System prompt contains | Size |
|------|----------------------|------|
| **A (raw)** | Generic HubSpot assistant instruction + API token + curl instructions | ~426 chars |
| **B (guide)** | Everything in A **+ the full `hubspot-system-guide.md`** | ~14,500 chars |
| **C (guide+skill)** | Everything in B **+ a specific skill file** | ~17,700 chars |

**Tier A** measures what the LLM can figure out from general HubSpot API knowledge alone. It has to discover custom objects, pipelines, and the data model by making exploratory API calls.

**Tier B** measures how much the system guide helps. The LLM already knows the entity hierarchy, pipeline stages, associations, broken fields, and workflows before it starts querying.

**Tier C** measures what a targeted skill adds on top of the guide.

The **delta between A and B** tells us how good the system guide is. The **delta between B and C** tells us how much value each skill adds. These deltas drive decisions about what to invest in.

### Running the harness

```bash
# Set the HubSpot token
export HUBSPOT_TOKEN='pat-eu1-...'

# Dry run — see what would be sent, no API calls
python3 test_harness.py --dry-run

# Single test to verify everything works
python3 test_harness.py --tier A --prompt A1

# Run all 13 prompts for Tier A baseline
python3 test_harness.py --tier A

# Compare with Tier B (system guide loaded)
python3 test_harness.py --tier B

# Full run — all tiers, all prompts
python3 test_harness.py
```

Results are saved to `docs/test-results/` as both JSON (full data) and markdown (human-readable with scoring placeholders).

---

## Phase 1: Baseline Testing (No Skills)

### Purpose

Establish what the LLM gets right and wrong across all three context tiers, with no skill-based workflows.

### Test design

Run 13 challenge prompts that cover the core tasks operators actually do. Each prompt is run in Tier A (raw) and Tier B (with system guide) to measure the guide's impact. Record exactly what the LLM gets right, wrong, or makes up.

### Challenge categories

#### A. Data model comprehension

These test whether the LLM understands how entities relate and where data lives.

| # | Prompt | What correct looks like | Common failure mode |
|---|--------|------------------------|-------------------|
| A1 | "Which companies are MOJU's active buyers?" | Query Brand records where `client_name_sync = "MOJU"`, filter by stage = "Won", read buyer from Company association | Confuses Company entity (no client/buyer flag) with Deal type; queries wrong entity |
| A2 | "How many products has MOJU placed at Farmer J?" | Find Brand record for MOJU/Farmer J, get associated Product Pitches at "Product Placed" stage | Uses `products_placed` rollup field (which is broken — always 0) instead of querying Product Pitches directly |
| A3 | "What's the difference between a Deal and a Brand?" | Deal = sales opportunity (two types: client acquisition / buyer development). Brand = one client's products being pitched to one buyer. Brand sits below Deal. | Treats them as interchangeable or gets the hierarchy wrong |
| A4 | "Where do I find nutritional data for a product?" | Client Product entity, 67 properties including per-serving and per-100g nutritional fields | Looks on Product Pitch (lightweight junction record, 37 properties) or Brand |
| A5 | "Show me all activity for the MOJU account this month" | Explains the multi-hop query: Client Service → Deals → Meetings. Flags that 11/14 MOJU deals have no meeting associations. | Assumes direct activity association exists; doesn't flag the known data gap |

#### B. Workflow comprehension

These test whether the LLM understands how operators actually use HubSpot.

| # | Prompt | What correct looks like | Common failure mode |
|---|--------|------------------------|-------------------|
| B1 | "Walk me through onboarding a new client" | Describes the Client Service pipeline stages 0-4, product data entry (67 fields from client spreadsheets), Brand Induction | Invents steps that don't exist in the system; misses the data-heavy import step |
| B2 | "How do I track a new buyer pitch?" | Create buyer Deal → workflow auto-creates Brand records → create Product Pitches under each Brand → move stages as pitch progresses | Suggests creating Brand records manually; misses the automation |
| B3 | "Where do operators spend most of their time?" | Buyer deal board (kanban), moving stages, checking pipeline status. Communication happens outside HubSpot. | Assumes HubSpot is the communication platform (calls/emails are empty) |
| B4 | "Why are there duplicate Brand records?" | Explains the workflow bug: creating records on 80-104 min intervals, no guard condition | Doesn't mention it; or suggests it's intentional |

#### C. Query construction

These test whether the LLM can construct correct multi-step HubSpot queries.

| # | Prompt | What correct looks like | Common failure mode |
|---|--------|------------------------|-------------------|
| C1 | "Build me a report: pipeline status for all clients" | Brand records grouped by `client_name_sync`, then by pipeline stage, counting unique buyers per stage | Queries Deals instead of Brands; misses the Brand = client/buyer intersection |
| C2 | "Which products are we pitching but haven't placed yet?" | Product Pitch records at "Proposed" or "Negotiation" stage, joined to Client Product for details and Brand for buyer context | Queries wrong entity; confuses Product Pitch stages with Brand stages |
| C3 | "Get me a list of all contacts at buyers we've won deals with" | Deals at "Won" stage in Buyer Deal Pipeline → associated Companies → associated Contacts | Tries to filter Companies directly (no client/buyer flag exists) |

#### D. Data quality awareness

These test whether the LLM flags known issues rather than blindly trusting the data.

| # | Prompt | What correct looks like | Common failure mode |
|---|--------|------------------------|-------------------|
| D1 | "How many products has MOJU placed total?" | Queries Product Pitches at "Product Placed" stage. Flags that the `products_placed` rollup on Brand shows 0 and shouldn't be trusted. | Uses the broken rollup field and reports 0 |
| D2 | "Pull the financial summary for MOJU's pitches" | Flags that `amount` fields are null across all Product Pitch and Brand records. States this data isn't available. | Hallucinates numbers or returns 0 without flagging the gap |
| D3 | "How many meetings did we have with MOJU buyers this week?" | Returns what's available but flags the known association gap (11/14 deals have no meetings linked despite activity happening) | Reports the count without the caveat |

### Recording results

The test harness automatically saves results per tier:

- **JSON** (`docs/test-results/{run-id}_tier-{A|B|C}.json`) — full data including raw responses, timing, turn counts
- **Markdown** (`docs/test-results/{run-id}_tier-{A|B|C}.md`) — human-readable summary with scoring placeholders

Each markdown result includes a scoring table to fill in during manual review:

| Criterion | Score | Notes |
|-----------|-------|-------|
| Correct entity used? | _/5 | |
| Correct fields/properties? | _/5 | |
| Correct query path? | _/5 | |
| Data quality flagged? | _/5 | |
| Hallucination? | _/5 | |
| Overall | _/5 | |

After scoring, summarise across tiers to compare:

| Prompt | Tier A score | Tier B score | Delta | Notes |
|--------|-------------|-------------|-------|-------|
| A1 | _/5 | _/5 | | |
| A2 | _/5 | _/5 | | |
| ... | | | | |

### What to look for

After running all tests, categorise failures into patterns:

- **Entity confusion** — querying the wrong object or misunderstanding the hierarchy
- **Field confusion** — using broken/empty fields without flagging the issue
- **Missing context** — not knowing about data quality issues, automation, or gaps
- **Workflow gaps** — not understanding how operators actually use the system
- **Hallucination** — inventing data, fields, or capabilities that don't exist
- **Query construction** — wrong API paths, missing association hops, incorrect filters

These categories become the targets for Phase 2.

---

## Phase 2: Skill Development

### The cycle

For each failure pattern identified in Phase 1:

```
1. OBSERVE  — Document the specific failure(s)
2. WRITE    — Create a minimal skill that addresses the failure
3. TEST     — Re-run the same challenge prompts with the skill loaded
4. REFINE   — Find new failure modes or rationalisations, tighten the skill
5. REPEAT   — Until the failure pattern is reliably corrected
```

### Skill candidates (updated after Phase 1 baseline — 2026-03-20)

These are now driven by observed failures, not hypotheses. The system guide already eliminates entity confusion (Tier A→B delta). The remaining failures are about API mechanics and data quality enforcement.

| Priority | Failure pattern | Skill | What it would do | Evidence |
|----------|----------------|-------|-----------------|----------|
| **1** | Can't query custom objects | `hubspot-api-reference` | Provide objectTypeIds for Brand, Product Pitch, Client Product, Client Service. Include working curl examples. | 6/13 Tier B tests failed because LLM couldn't access custom objects it knew about |
| **2** | Broken field trust | `hubspot-data-quality` | Iron Laws: NEVER trust `products_placed` rollup, NEVER report `amount` without null-check. Red Flags table for each broken field. | D1, D2, D3 all need explicit "this field is broken" enforcement |
| **3** | Timeout from exploratory probing | `hubspot-query-patterns` | Canonical multi-step query recipes with exact API calls. Prevents 40+ turn exploration loops. | A2, C1, C2, D2 all timed out while probing endpoints |
| ~~4~~ | ~~Entity confusion~~ | ~~`hubspot-data-model`~~ | ~~N/A — system guide already eliminates this~~ | ~~Tier A→B delta: 7/13 → 0/13 entity confusion~~ |
| ~~5~~ | ~~Missing workflow knowledge~~ | ~~`hubspot-operator-workflow`~~ | ~~N/A — system guide already covers this~~ | ~~B2 answered perfectly in 1 turn from guide alone~~ |

### Skill writing process

Follow the TDD-for-skills pattern:

1. **Start with the failure.** Don't write a skill because it "seems useful." Write it because you watched the LLM get something wrong.

2. **Write minimal content.** Under 500 words. Address the specific failure, not every possible edge case. You can always expand later.

3. **Use Iron Laws for critical constraints.** If the failure mode is dangerous (e.g., reporting hallucinated numbers to a client), add an absolute constraint:
   > *"NEVER report a numeric value from a HubSpot field without verifying it is populated. If a field is null or 0, state that explicitly."*

4. **Add Red Flags for rationalisations.** Anticipate how the LLM will try to skip the skill:
   > | Thought | Reality |
   > |---------|---------|
   > | "The rollup field will have the count" | `products_placed` is broken — always 0. Query Product Pitches directly. |
   > | "I can filter Companies by type" | No client/buyer flag exists on Company. Use Deal type or associations. |

5. **Include trigger conditions in the description.** Not what the skill does, but when to use it:
   > Bad: `"Helps with HubSpot data queries"`
   > Good: `"Use when querying HubSpot data or constructing reports that reference entity relationships, field values, or pipeline stages"`

6. **Test under pressure.** Run prompts that push toward shortcuts: "Just quickly tell me how many products MOJU has placed" or "Give me the MOJU numbers, don't overthink it." The skill must hold up under these conditions.

### Iteration tracking

For each skill, maintain a log:

```markdown
## Skill: [name]
### v1 — [date]
- **Failure addressed:** [what went wrong]
- **Content:** [summary of what the skill says]
- **Test results:** [which prompts improved, which still fail]
- **New failures found:** [rationalisations or edge cases discovered]

### v2 — [date]
- **Changes:** [what was added/modified]
- **Test results:** [improvement measured]
```

Store in `docs/skill-development-log.md`.

---

## Phase 3: Integration Testing

Once individual skills exist, test them in combination:

### Combined workflow tests

Run end-to-end scenarios that require multiple skills to work together:

| Scenario | Skills involved | What to check |
|----------|----------------|--------------|
| "Generate a weekly report for MOJU" | data model + data quality + reporting + weekly-report | Does it pull the right data, flag the caveats, and produce a correct report? |
| "A new client just signed — what do I do?" | operator workflow + data model | Does it walk through the correct onboarding pipeline? |
| "Build me a pitch deck for MOJU at a new buyer" | data model + query patterns + data quality | Does it know where product specs live, what data is available, what's missing? |

### Regression testing

When adding a new skill, re-run the full challenge set to ensure:
- New skill doesn't degrade performance on previously-passing tests
- Skills don't conflict (contradictory instructions)
- Context budget isn't blown by loading too many skills simultaneously

### Context budget monitoring

Track token usage across test runs:
- System guide alone: X tokens
- System guide + 1 skill: X tokens
- System guide + all skills: X tokens
- Remaining budget for actual work: X tokens

If total scaffolding exceeds ~30% of context window, consolidate or use on-demand loading.

---

## Process summary

```
Phase 1: Baseline
    │
    ├── python3 test_harness.py --tier A          (raw LLM, no guide)
    ├── python3 test_harness.py --tier B          (with system guide)
    ├── Score results in docs/test-results/*.md
    ├── Compare Tier A vs B scores (delta = guide value)
    └── Categorise failure patterns
         │
         ▼
Phase 2: Skill Development (per failure pattern)
    │
    ├── Document the failure
    ├── Write minimal skill (< 500 words)
    ├── python3 test_harness.py --tier C          (with guide + skill)
    ├── Compare Tier B vs C scores (delta = skill value)
    ├── Find new failures, tighten skill
    ├── Log iterations in skill-development-log.md
    └── Repeat until failure pattern is reliably corrected
         │
         ▼
Phase 3: Integration
    │
    ├── Combined workflow tests (multi-skill scenarios)
    ├── Regression testing (no degradation)
    └── Context budget monitoring (< 30% of window)
```

---

## Files this process will produce

```
test_harness.py                                (exists — test runner script)

docs/
├── hubspot-system-guide.md                    (exists)
├── llm-scaffolding-framework-learnings.md     (exists)
├── hubspot-framework-testing-process.md       (this document)
├── skill-development-log.md                   (Phase 2 tracking)
├── test-results/                              (gitignored — may contain HubSpot data)
│   ├── {run-id}_tier-A.json                   (raw JSON results)
│   ├── {run-id}_tier-A.md                     (scored markdown summary)
│   ├── {run-id}_tier-B.json
│   ├── {run-id}_tier-B.md
│   ├── {run-id}_tier-C.json
│   └── {run-id}_tier-C.md
└── plans/
    └── 2026-03-18-weekly-report-skill-design.md  (exists)

plugins/pluginbrands-toolkit/skills/
├── weekly-report/SKILL.md                     (exists)
└── [new skills as identified by testing]/SKILL.md
```

---

## Starting point

Phase 1 can begin immediately:

```bash
export HUBSPOT_TOKEN='pat-eu1-...'

# Verify setup with a single test
python3 test_harness.py --tier A --prompt A1

# Run the full Tier A baseline
python3 test_harness.py --tier A

# Then Tier B to measure the system guide's impact
python3 test_harness.py --tier B
```

The system guide is written, the challenge prompts are defined, the harness is built, and the recording format is automated. Run the baselines, score the results, and let the failures drive skill development.

---

## Phase 1 completion log (2026-03-20)

### Runs completed

| Run | Tier | Prompts | Completed | Timed out | Total time |
|-----|------|---------|-----------|-----------|------------|
| `2026-03-20_1109` | A | 13 | 10 | 3 (A2, D1, D2) | ~38 min |
| `2026-03-20_1203` | B | 13 | 9 | 4 (A2, A5, C1, C2) | ~52 min |

### Harness issues discovered

1. **Output buffering.** Python's `subprocess.run` buffers stdout, so the harness produces no visible progress until a test completes. For long runs (13 × 4 min), this makes monitoring difficult. Fix: add `flush=True` to print statements or use unbuffered mode.

2. **Interactive prompt blocks automation.** The `input("Press Enter...")` at line 552 requires piping `echo ""` when running from another process. Fix: add a `--yes` / `--no-confirm` flag to skip the confirmation prompt.

3. **300s timeout too short for Opus with custom objects.** Several tests timed out while the LLM was still making productive API calls (exploring custom object endpoints). Tier B tests are slower because the LLM spends more turns trying to access entities it knows exist. Consider 600s for complex queries.

4. **Token invalidation mid-run.** HubSpot PAT tokens can be revoked when a new access key is generated. The harness should validate the token at startup (e.g., a quick `/crm/v3/objects/contacts?limit=1` call) and fail fast if auth is broken.

5. **No per-test progress logging.** The harness only saves results at the end of a tier run. If the process dies mid-run, all completed tests in that tier are lost. Fix: append results incrementally to the JSON file.

### Token scope issue

The PAT (`pat-eu1-...`) successfully accesses standard objects (Companies, Contacts, Deals) but returns "Invalid object or event type id" for custom objects (Brand, Product Pitch, Client Product, Client Service). Investigation revealed:

- `/crm/v3/schemas` returns `INVALID_AUTHENTICATION` with the PAT (requires OAuth)
- Custom objects need numeric `objectTypeId` values, not names
- The PAT likely lacks `crm.objects.custom.read` and `crm.schemas.custom.read` scopes

**Action required before Tier C testing:** generate a new PAT with custom object scopes, or discover the objectTypeIds through the HubSpot UI and hardcode them in the system guide / skill.
