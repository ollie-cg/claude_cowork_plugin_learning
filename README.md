# PluginBrands Toolkit

Tooling for PluginBrands' commercial operations: a Claude Code plugin for HubSpot CRM workflows, a product catalog app, and a test framework that proves the plugin works.

## System map

Three components, connected through HubSpot and the Gamma API:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Plugin** | `plugins/pluginbrands-toolkit/` | Claude Code plugin with skills that teach Claude the PluginBrands HubSpot data model |
| **Catalog App** | `catalog-app/` | Next.js web app for managing product data, brand assets, and generating sales decks via Gamma |
| **Test Harness** | `tests/` | Automated framework that runs CRM workflows against live HubSpot and scores skill effectiveness |

How they relate:

- The **plugin** gives Claude domain knowledge (custom object IDs, pipelines, query recipes) so it can work with HubSpot reliably
- The **catalog app** stores product specifications and images, and generates Gamma presentation decks from that data
- The **test harness** spawns isolated Claude sessions with and without the plugin skill, runs real CRM workflows, and verifies results via the HubSpot API

## Directory structure

```
.
├── plugins/
│   └── pluginbrands-toolkit/           # The production plugin
│       ├── .claude-plugin/plugin.json
│       └── skills/
│           ├── hubspot-api-query/      # CRM domain knowledge skill
│           └── hubspot-hygiene-check/  # Data quality audit skill
├── catalog-app/                        # Next.js product catalog + deck generator
│   ├── src/
│   │   ├── app/                        # Pages and API routes
│   │   ├── components/                 # React UI components
│   │   ├── lib/                        # Database, queries, Gamma client
│   │   └── types/                      # TypeScript interfaces
│   └── data/
│       ├── catalog.db                  # SQLite database
│       └── images/                     # Product and brand images
├── tests/
│   ├── process_registry.json           # Workflow definitions (5 processes)
│   └── test_harness.py                 # Python test runner (Tier A/B)
├── docs/
│   ├── hubspot-system-guide.md         # Authoritative HubSpot system reference
│   ├── development-history.md          # Implementation journal and decisions log
│   ├── plans/                          # Active design and implementation docs
│   └── archived/                       # Historical research and superseded plans
└── .env                                # HubSpot service key (not committed)
```

## The domain

PluginBrands is a commercial growth agency. Brands (drinks, snacks, household products) pay PluginBrands a retainer. PluginBrands pitches those brands' products to retailers, caterers, and wholesalers.

The HubSpot CRM tracks this with four custom objects alongside standard Companies, Contacts, and Deals:

| Object | Type ID | Purpose |
|--------|---------|---------|
| Client Service | `0-162` | Live contracts with client brands |
| Client Product | `0-410` | Product spec sheets (67 fields) |
| Product Pitch | `0-420` | One SKU proposed to one buyer |
| Brand | `0-970` | One client brand x one buyer intersection |

For the full data model, pipelines, automation chains, and API connection details, see `docs/hubspot-system-guide.md`.

## Plugin

The plugin lives at `plugins/pluginbrands-toolkit/` and contains two skills:

**`hubspot-api-query`** — Teaches Claude the PluginBrands HubSpot data model. Contains custom object IDs, pipeline stage mappings, association types, query recipes, field value standards, and "iron laws" that prevent common errors. This is the core skill — without it, Claude cannot discover numeric custom object IDs via the API and fails on any workflow involving Brands, Product Pitches, or Client Services.

**`hubspot-hygiene-check`** — Audits data quality for a named person's records. Checks deals, brands, and product pitches for missing values, stale data, and structural issues.

### Installation

Install via Claude Code / Cowork plugin marketplace, or point directly at this repo.

## Catalog App

A Next.js web application for managing product catalogs and generating sales presentation decks.

**Stack:** Next.js 16, React 19, TypeScript, SQLite (better-sqlite3), shadcn/ui, Tailwind CSS

**Data model:** Brands → Products (50+ fields covering identity, commercial, physical, nutritional, sourcing) → Product Images (hero, pack, lifestyle, nutritional)

### Running locally

```bash
cd catalog-app
npm install
npm run dev    # http://localhost:3000
```

### Key pages

- `/` — Brand grid with logos and product counts
- `/brands/[id]` — Brand detail with product table
- `/products/[id]` — Full product editor with image gallery
- `/brands/new`, `/products/new` — Creation forms

### API

- `GET /api/brands` — All brands with product counts
- `GET /api/brands/[id]` — Brand detail + products
- `GET /api/products/[id]` — Product with images
- `POST /api/decks/gamma` — Generate a Gamma presentation deck from catalog data

## Test Harness

Automated framework that runs CRM workflows against live HubSpot to test the plugin's effectiveness.

### How it works

1. **Pre-cleanup** — Deletes stale `[TEST]`-prefixed records from previous runs
2. **Execute** — Spawns an isolated Claude session with the workflow prompt
3. **Verify** — Checks each action via the HubSpot API
4. **Teardown** — Deletes test records

Runs in two tiers: **Tier A** (no skill) and **Tier B** (with skill). Comparing them measures whether the skill improves reliability and speed.

### Running tests

```bash
python3 tests/test_harness.py                           # Run all
python3 tests/test_harness.py --process buyer.onboard   # Run one process
python3 tests/test_harness.py --tier A                  # Single tier
python3 tests/test_harness.py --dry-run                 # Preview only
python3 tests/test_harness.py --yes                     # Skip confirmation
```

### Defined workflows

| Process | What it tests | Skill needed? |
|---------|--------------|---------------|
| `buyer.onboard` | Company + contact + buyer deal creation | No |
| `buyer.onboard_with_engagements` | Onboarding + notes and calls | No |
| `buyer.pipeline_progression` | Deal through all 9 pipeline stages | No |
| `brand.update` | Custom object (Brand) field updates | Marginal |
| `pitch.update` | Full automation chain with Product Pitches | Yes — Tier A fails, Tier B passes |

## Documentation

| File | Content |
|------|---------|
| `docs/hubspot-system-guide.md` | Full HubSpot data model, pipelines, automation chains, API connection details |
| `docs/development-history.md` | Implementation journal — phases, test results, decisions |
| `docs/plans/` | Active design and implementation documents |
| `docs/archived/` | Historical research (LLM scaffolding learnings, old test results, superseded plans) |

## Prerequisites

- Claude Code CLI installed and authenticated
- HubSpot service key with CRM read/write access (stored in `.env`)
- Node.js (for the catalog app)
- Python 3 (for the test harness)
