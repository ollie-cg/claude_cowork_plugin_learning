# LLM Scaffolding Framework

A testing framework that measures how effectively different types of context help Claude Opus understand a complex HubSpot CRM. The core finding: a well-crafted 8.9 KB skill outperforms a 17.8 KB reference guide by 3x at half the token cost.

## What this project proves

LLMs follow **workflows** more reliably than they extract patterns from **reference documents**. Specifically:

| Context tier | What's provided | Completed | Avg score | Context size |
|---|---|---|---|---|
| A (raw) | API token + generic instructions | 10/13 | 1.5/5 | 426 chars |
| B (guide) | A + system guide | 9/13 | 2.3/5 | 18.2 KB |
| C (guide+skill) | B + skill | 13/13 | ~4.6/5 | 20.7 KB |
| **D (skill only)** | **A + skill** | **13/13** | **~4.7/5** | **9.6 KB** |

The skill alone (Tier D) matched or beat every other configuration. The system guide added no value when a skill was present.

## How it works

The test harness spawns isolated Claude processes with controlled context, runs 13 challenge prompts across 4 categories, and records results.

```
test_harness.py
  ├── Builds system prompt for chosen tier (A/B/C/D)
  ├── Spawns `claude --model opus` as isolated subprocess
  │     --setting-sources ""         (no plugins/project config)
  │     --tools "Bash"               (curl only, via Bash)
  │     --no-session-persistence     (no state between tests)
  │     --dangerously-skip-permissions
  ├── Passes one of 13 challenge prompts
  ├── Captures JSON response + timing
  └── Saves results to docs/test-results/
```

### Challenge categories

- **Data Model** (A1-A5) — Can the LLM find and query the right entity?
- **Workflow** (B1-B2) — Does it understand business processes?
- **Query** (C1-C3) — Can it construct multi-step queries?
- **Data Quality** (D1-D3) — Does it flag known data issues?

## Project structure

```
.
├── test_harness.py                     # Test runner (spawns isolated claude processes)
├── .env                                # HubSpot PAT token (not committed)
├── docs/
│   ├── hubspot-system-guide.md         # Reference doc (17.8 KB) — used in Tier B/C
│   ├── hubspot-connection.md           # API connection reference
│   ├── hubspot-framework-testing-process.md  # Testing methodology
│   ├── llm-scaffolding-framework-learnings.md  # Key findings and patterns
│   └── test-results/                   # JSON + Markdown from each run
└── plugins/
    └── pluginbrands-toolkit/
        └── skills/
            └── hubspot-api-query/
                └── SKILL.md            # The skill (8.9 KB) — used in Tier C/D
```

## Running tests

### Prerequisites

- Claude Code CLI installed and authenticated
- HubSpot Private App Token with CRM read access

### Setup

```bash
export HUBSPOT_TOKEN='pat-eu1-...'
```

### Usage

```bash
# Run all tiers, all prompts
python3 test_harness.py

# Single tier
python3 test_harness.py --tier D

# Single prompt
python3 test_harness.py --prompt A1

# Specific tier + prompt
python3 test_harness.py --tier D --prompt A1

# Dry run (shows prompts without calling the API)
python3 test_harness.py --dry-run

# Custom skill name
python3 test_harness.py --skill hubspot-api-query
```

Results are saved to `docs/test-results/` as both JSON (full data) and Markdown (human-readable with scoring tables).

## Key patterns that work

These patterns, documented in detail in `docs/llm-scaffolding-framework-learnings.md`, drive the skill's effectiveness:

- **Iron Laws** — Single absolute constraints (`NEVER query custom objects by name`) hold under pressure where fuzzy guidance doesn't
- **Red Flags tables** — Explicitly list rationalisations the LLM will try, paired with corrections
- **Query recipes** — Exact multi-step curl examples eliminate exploratory API probing (the main cause of Tier B timeouts)
- **Sequential gates** — Force a pipeline where each phase produces an artifact for approval

## The domain

PluginBrands is a commercial growth agency that pitches consumer brand products to retailers and caterers. The HubSpot CRM uses four custom objects:

| Object | Type ID | Purpose |
|---|---|---|
| Client Service | `0-162` | Live contracts with client brands |
| Client Product | `0-410` | Product spec sheets (67 fields) |
| Product Pitch | `0-420` | One SKU proposed to one buyer |
| Brand | `0-970` | Client x buyer intersection |

The skill teaches the LLM to query these by numeric type ID (not name), flag known data quality issues, and follow efficient query paths.
