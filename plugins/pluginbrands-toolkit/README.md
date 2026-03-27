# PluginBrands Toolkit

Claude Code plugin for PluginBrands HubSpot CRM operations.

## Skills

| Skill | Invoke with | Purpose |
|-------|------------|---------|
| hubspot-api-query | `Skill(pluginbrands-toolkit:hubspot-api-query)` | CRM data model, object type IDs, pipeline stages, API patterns, and query recipes. Must be active before any HubSpot API call. |
| hubspot-hygiene-check | `Skill(pluginbrands-toolkit:hubspot-hygiene-check)` | Data cleanliness audit scoped to a named person. Checks deals, brands, and product pitches for missing values, stale descriptions, and structural issues. |
| generate-buyer-deck | `Skill(pluginbrands-toolkit:generate-buyer-deck)` | Generates tailored Gamma sales decks for retail buyers. Orchestrates HubSpot buyer intelligence, Catalog App product data, and Gamma MCP with automated Puppeteer visual QA. |

## Usage

### HubSpot API Query

Loaded automatically when working with HubSpot data. Provides object type IDs for custom objects (Brand `0-970`, Product Pitch `0-420`, Client Service `0-162`, Client Product `0-410`), pipeline stage mappings, automation chain documentation, and common query recipes.

### HubSpot Hygiene Check

Run by asking:
- "Check hygiene for Simon"
- "Run a cleanliness check for Issy"
- "How clean is Adam's data?"

Checks:
- **Deals** — amount, close date, company/contact/brand associations
- **Brands** — status, description accuracy vs logged activity
- **Product Pitches** — price, standardised naming, decline reasons

Produces a per-record issue list and a summary rollup table.

### Generate Buyer Deck

Run by asking:
- "Generate a deck for Tesco"
- "Create a pitch for Sainsbury's"
- "Build a presentation for this buyer"

Requires:
- `hubspot-api-query` skill (active)
- Gamma MCP server (configured)
- `CATALOG_APP_URL` environment variable (set)
- Puppeteer MCP tools (optional — for visual QA)

Workflow:
1. Gathers buyer intelligence from HubSpot (emails, notes, calls, deals)
2. Proposes buyer motives for user validation
3. Presents brand and product selection from the Catalog App
4. Crafts a tailored narrative for the deck
5. Generates via Gamma MCP with `chimney-dust` theme
6. Runs visual QA with Puppeteer, auto-retries up to 2x if issues found

## Setup

This plugin is registered via the project-root marketplace at `.claude-plugin/marketplace.json`. To enable:

1. Add to `~/.claude/settings.json`:
   ```json
   "enabledPlugins": {
     "pluginbrands-toolkit@pluginbrands-marketplace": true
   }
   ```

2. Add skill permissions to `.claude/settings.local.json`:
   ```json
   "Skill(pluginbrands-toolkit:hubspot-api-query)",
   "Skill(pluginbrands-toolkit:hubspot-hygiene-check)",
   "Skill(pluginbrands-toolkit:generate-buyer-deck)"
   ```

3. Restart Claude Code.
