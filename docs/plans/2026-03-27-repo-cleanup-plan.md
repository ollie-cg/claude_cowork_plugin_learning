# Repo Cleanup & README Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up irrelevant files, fix gitignore gaps, archive superseded docs, and replace the README with an LLM-optimised system reference.

**Architecture:** File moves, deletions, and edits — no code changes. The README is rewritten from scratch targeting LLMs (Claude in Cowork) as the primary audience, structured as a system map + usage guide.

**Tech Stack:** Git, markdown

---

### Task 1: Fix .gitignore and remove .DS_Store

**Files:**
- Modify: `.gitignore`
- Delete: `.DS_Store` (from git tracking only)

**Step 1: Update .gitignore**

Add these entries to `.gitignore`:

```
# macOS
.DS_Store

# SQLite temp files
*.db-shm
*.db-wal
```

**Step 2: Remove .DS_Store from git tracking**

Run:
```bash
git rm --cached .DS_Store
```

Expected: file removed from index, still exists on disk.

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: fix .gitignore — add .DS_Store, SQLite temp files"
```

---

### Task 2: Archive superseded plan files

**Files:**
- Move: `docs/plans/2026-03-26-product-catalog-app-plan.md` → `docs/archived/plans/`
- Move: `docs/plans/2026-03-26-moju-data-scrape.md` → `docs/archived/plans/`
- Move: `docs/plans/2026-03-26-deck-generator-plan.md` → `docs/archived/plans/`
- Move: `docs/plans/2026-03-26-deck-generator-implementation.md` → `docs/archived/plans/`

These are superseded: the catalog app plan is implemented, the moju scrape was a one-time data load, and the deck-generator-plan and deck-generator-implementation were superseded by the Gamma-based approach.

**Step 1: Create the archived plans directory**

Run:
```bash
mkdir -p docs/archived/plans
```

**Step 2: Move the files**

Run:
```bash
git mv docs/plans/2026-03-26-product-catalog-app-plan.md docs/archived/plans/
git mv docs/plans/2026-03-26-moju-data-scrape.md docs/archived/plans/
git mv docs/plans/2026-03-26-deck-generator-plan.md docs/archived/plans/
git mv docs/plans/2026-03-26-deck-generator-implementation.md docs/archived/plans/
```

**Step 3: Commit**

```bash
git commit -m "chore: archive superseded plan files"
```

---

### Task 3: Archive LLM scaffolding learnings

**Files:**
- Move: `docs/llm-scaffolding-framework-learnings.md` → `docs/archived/`

This doc's findings are baked into the skill design. It's valuable as history but not something an LLM working with the system needs to read.

**Step 1: Move the file**

Run:
```bash
git mv docs/llm-scaffolding-framework-learnings.md docs/archived/
```

**Step 2: Commit**

```bash
git commit -m "chore: archive LLM scaffolding learnings — findings baked into skill"
```

---

### Task 4: Merge hubspot-connection.md into hubspot-system-guide.md

**Files:**
- Modify: `docs/hubspot-system-guide.md` — append API connection section at the end
- Delete: `docs/hubspot-connection.md`

The connection doc has useful operational detail (auth method, token storage, scopes, endpoints, pipeline IDs, workflow API). Merge it into the system guide as a new section so there's one authoritative HubSpot reference.

**Step 1: Append connection content to system guide**

Add the following section at the end of `docs/hubspot-system-guide.md` (after the "Brand and Product Pitch field usage" section):

```markdown

---

## API connection

### Authentication

The project connects to the PluginBrands HubSpot portal (`24916652`, EU datacenter) using a **HubSpot Service Key**. Despite the `pat-` prefix, this is a service key (not a Private App token), managed under Settings > Account Management > Integrations in the HubSpot UI.

- **Token format:** `pat-eu1-...` (Service Key)
- **Auth method:** Bearer token in the `Authorization` header
- **Datacenter:** EU (`eu1`)
- **Portal ID:** `24916652`
- **API base URL:** `https://api.hubapi.com`

```bash
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/contacts?limit=10"
```

### Token storage

The token is stored in the project `.env` file (gitignored):

```
HUBSPOT_TOKEN=pat-eu1-...
```

To load it in a shell session:

```bash
source .env && export HUBSPOT_TOKEN
```

### Token management

- **Manage:** HubSpot UI > Settings > Account Management > Integrations
- **Scopes:** Read and write access across CRM objects (contacts, companies, deals, custom objects, products, quotes, invoices, etc.)

### Common endpoints

| Endpoint | Description |
|----------|-------------|
| `/crm/v3/objects/{objectType}` | List/search standard objects (contacts, companies, deals, products) |
| `/crm/v3/objects/{objectTypeId}` | List records for custom objects by numeric ID (e.g., `0-970`) |
| `/crm/v3/objects/{objectType}/{recordId}` | Get a single record by ID |
| `/crm/v3/objects/{objectType}/search` | Search with filters (POST) |
| `/crm/v3/properties/{objectType}` | List all properties for an object type |
| `/crm/v3/pipelines/{objectType}` | List pipelines and stages for an object type |
| `/crm/v3/owners` | List CRM owners/users |

### Querying custom objects

Custom objects must be queried by numeric `objectTypeId` — name-based access does not work. See the Object type IDs table at the top of this guide.

```bash
# List Brand records with specific properties
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/0-970?limit=10&properties=buyer_name,client_name_sync,amount"

# Search Product Pitches
curl -X POST -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/0-420/search" \
  -d '{"filterGroups":[],"properties":["amount","client_name_sync"],"limit":10}'
```

### Pipeline IDs

| Object | Pipeline Name | Pipeline ID |
|--------|--------------|-------------|
| Deal | Buyer Deal Pipeline | `2760762586` |
| Deal | Client Deal Pipeline | `2760762585` |
| Client Service (`0-162`) | Service Pipeline | `ba9cdbd6-e220-45b2-a5a2-d67ebdcbade6` |
| Client Product (`0-410`) | Product Pipeline | `9dd7104c-1ae0-402b-a194-9cc567fd6a45` |
| Product Pitch (`0-420`) | Product Pitch Pipeline | `fdeea9a0-8d7e-4f9b-97b6-ca9a587eee87` |
| Brand (`0-970`) | Brand Pipeline | `139663aa-09ee-418e-b67d-c8cfcd3e5ce3` |
| Lead (`0-136`) | Buyer Pipeline | `2761663691` |

### Workflow/Automation API

The portal has 30 flows (29 enabled, 1 disabled) accessible via the v4 API. Several contain custom Python 3.9 / Node 20.x code actions.

```bash
# List all flows
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/automation/v4/flows"

# Get full flow detail (including source code of custom actions)
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/automation/v4/flows/{flowId}"
```
```

**Step 2: Delete the old connection doc**

Run:
```bash
git rm docs/hubspot-connection.md
```

**Step 3: Commit**

```bash
git add docs/hubspot-system-guide.md
git commit -m "chore: merge hubspot-connection.md into system guide"
```

---

### Task 5: Move PLAN.md to docs/

**Files:**
- Move: `PLAN.md` → `docs/development-history.md`

PLAN.md is a development journal — useful as history but shouldn't be a top-level file competing with README for an LLM's attention.

**Step 1: Move the file**

Run:
```bash
git mv PLAN.md docs/development-history.md
```

**Step 2: Commit**

```bash
git commit -m "chore: move PLAN.md to docs/development-history.md"
```

---

### Task 6: Write the new README

**Files:**
- Rewrite: `README.md`

Replace the entire README with the validated design from brainstorming. The target audience is LLMs (Claude in Cowork). Structure: system map → directory structure → component details with usage → docs index.

**Step 1: Write README.md**

Write the full contents of `README.md`:

```markdown
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README as LLM-optimised system reference"
```

---

### Task 7: Verify final state

**Step 1: Check directory structure is clean**

Run:
```bash
git status
```

Verify: no unintended changes, all moves/deletes are committed.

**Step 2: Verify docs/archived/ structure**

Run:
```bash
ls -la docs/archived/
ls -la docs/archived/plans/
```

Expected:
- `docs/archived/` contains: `hubspot-framework-testing-process.md`, `llm-scaffolding-framework-learnings.md`, `test-results/`, `plans/`
- `docs/archived/plans/` contains the 4 moved plan files

**Step 3: Verify no .DS_Store in git**

Run:
```bash
git ls-files | grep DS_Store
```

Expected: empty output (no .DS_Store tracked).
