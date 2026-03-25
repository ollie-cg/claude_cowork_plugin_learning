# PluginBrands HubSpot Plugin

A Claude Code / Cowork plugin that helps agencies work with complex HubSpot CRM setups. The plugin teaches Claude the domain model, query patterns, and data quality pitfalls so it can reliably execute real CRM workflows.

## What this project contains

**The plugin** (`plugins/pluginbrands-toolkit/`) — a skill that gives Claude deep knowledge of the PluginBrands HubSpot data model: custom objects, pipelines, associations, known data quality issues, and query recipes.

**The test harness** (`tests/`) — a framework that runs real CRM workflows against live HubSpot, scores pass/fail, classifies failures, and drives skill improvement.

These are deliberately separate. The plugin is the product. The tests prove it works.

## The domain

PluginBrands is a commercial growth agency that pitches consumer brand products to retailers and caterers. The HubSpot CRM uses four custom objects:

| Object | Type ID | Purpose |
|---|---|---|
| Client Service | `0-162` | Live contracts with client brands |
| Client Product | `0-410` | Product spec sheets (67 fields) |
| Product Pitch | `0-420` | One SKU proposed to one buyer |
| Brand | `0-970` | Client x buyer intersection |

## Current status

Working from the implementation plan in [`PLAN.md`](./PLAN.md).

**Phase 1** (in progress) — Defining and testing CRM workflows against live HubSpot.

**Processes passing:**

| Process | Actions | Tier A (raw) | Tier B (skill) |
|---------|---------|-------------|----------------|
| `buyer.onboard` | Create company, contact, buyer deal | PASS 3/3 (67s) | PASS 3/3 (102s) |
| `buyer.onboard_with_engagements` | Create company, deal, note, call log | PASS 4/4 (59s) | PASS 4/4 (67s) |

Both processes test standard HubSpot objects — no skill differentiation yet. Next workflows to define: Brand creation (custom object `0-970`), Product Pitch operations (`0-420`), pipeline progression, and data quality queries — these are where the skill should start differentiating from raw capability.

## Background

This project started as a research framework measuring how different types of context (raw instructions, reference guides, structured skills) affect Claude's ability to work with a complex CRM. Key finding: **a well-crafted 8.9 KB skill outperforms a 17.8 KB reference guide by 3x at half the token cost.** LLMs follow workflows more reliably than they extract patterns from reference documents.

That research lives in `docs/archived/` and informed how the skill is structured. The project is now focused on turning that into a production plugin tested against real client workflows.

## Project structure

```
.
├── PLAN.md                                # Implementation plan (start here)
├── plugins/
│   └── pluginbrands-toolkit/              # The plugin
│       ├── .claude-plugin/plugin.json
│       └── skills/
│           └── hubspot-api-query/
│               └── SKILL.md               # Domain knowledge skill
├── tests/                                 # Test harness (tests the plugin)
│   ├── process_registry.json              # Workflow definitions
│   ├── test_harness.py                    # Test runner (Tier A/B)
│   └── runs/                              # Test results (one JSON per run)
├── docs/
│   ├── hubspot-connection.md              # API connection details
│   ├── llm-scaffolding-framework-learnings.md  # Research findings
│   ├── plans/                             # Design documents
│   └── archived/                          # Historical research (old tiers, guides)
└── .env                                   # HubSpot service key (not committed)
```

## Prerequisites

- Claude Code CLI installed and authenticated
- HubSpot service key with CRM read/write access
