# PluginBrands Toolkit

Tooling for PluginBrands' commercial operations: a Claude Code plugin for HubSpot CRM workflows, plus a custom MCP server that gives the team centralised, authenticated access to HubSpot including its custom objects.

## System map

Two components, connected through HubSpot:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Plugin** | `apps/pluginbrands-toolkit/` | Claude Code plugin with skills that teach Claude the PluginBrands HubSpot data model |
| **MCP Server** | `apps/mcp-server/` | Standalone Node.js MCP server on Railway that holds the HubSpot token and exposes per-user, attributed access to the CRM (including custom objects) |

How they relate:

- The **plugin** gives Claude domain knowledge (custom object IDs, pipelines, query recipes) so it can work with HubSpot reliably
- The **MCP server** centralises the HubSpot credential, authenticates each team member via OAuth, and exposes a small set of generic CRM tools that work with custom objects — something HubSpot's official MCP doesn't support

## Directory structure

```
.
├── apps/
│   ├── pluginbrands-toolkit/           # The production plugin
│   │   ├── .claude-plugin/plugin.json
│   │   └── skills/
│   │       └── hubspot-api-query/      # CRM domain knowledge skill
│   └── mcp-server/                     # Custom HubSpot MCP server (Railway)
│       ├── src/
│       ├── Dockerfile
│       └── README.md
├── .claude-plugin/
│   └── marketplace.json                # Points Claude Code at apps/pluginbrands-toolkit
├── docs/
│   ├── hubspot-system-guide.md         # Authoritative HubSpot system reference
│   ├── development-history.md          # Implementation journal and decisions log
│   ├── plans/                          # Active design and implementation docs
│   ├── issues/                         # Known issues and incidents
│   └── archived/                       # Historical research and superseded plans
└── .env                                # HubSpot service key (not committed)
```

Historical note: this repo also previously contained `catalog-app/` (a Next.js product catalogue + Gamma deck generator) and `tests/` (a Python test harness). Both were offloaded on 2026-04-24 and are preserved on the `archive/catalog-and-harness` branch.

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

The plugin lives at `apps/pluginbrands-toolkit/` and contains one skill:

**`hubspot-api-query`** — Teaches Claude the PluginBrands HubSpot data model. Contains custom object IDs, pipeline stage mappings, association types, query recipes, field value standards, and "iron laws" that prevent common errors. This is the core skill — without it, Claude cannot discover numeric custom object IDs via the API and fails on any workflow involving Brands, Product Pitches, or Client Services.

### Installation

```
/plugin marketplace add ollie-cg/claude_cowork_plugin_learning@v1.2.0
/plugin install pluginbrands-toolkit@pluginbrands-marketplace
```

For team-wide install, committed settings, env vars, and release instructions see `apps/pluginbrands-toolkit/README.md`.

## MCP Server

The MCP server lives at `apps/mcp-server/` and is deployed to Railway. It solves two problems with HubSpot's official MCP:

- The official server doesn't support custom objects, which breaks every PluginBrands workflow.
- Individual HubSpot tokens on 6 laptops is a credential-sprawl risk.

The server holds a single HubSpot private app token, authenticates each team member via OAuth (client credentials), maps them to their HubSpot owner ID for record attribution, and exposes a small set of generic tools (search, get, create, update, batch read, associations, pipelines, owners) that work across all object types.

See `apps/mcp-server/README.md` for architecture, local development, and deployment instructions.

## Documentation

| File | Content |
|------|---------|
| `docs/hubspot-system-guide.md` | Full HubSpot data model, pipelines, automation chains, API connection details |
| `docs/development-history.md` | Implementation journal — phases, test results, decisions |
| `docs/plans/` | Active design and implementation documents |
| `docs/issues/` | Known issues and incidents |
| `docs/archived/` | Historical research (LLM scaffolding learnings, old test results, superseded plans) |

## Prerequisites

- Claude Code CLI installed and authenticated
- HubSpot service key with CRM read/write access (stored in `.env`, or on the MCP server for team access)
- Node.js (for the MCP server)
