# PluginBrands Toolkit

Claude Code plugin for PluginBrands HubSpot CRM operations.

## Skills

| Skill | Invoke with | Purpose |
|-------|------------|---------|
| hubspot-api-query | `Skill(pluginbrands-toolkit:hubspot-api-query)` | CRM data model, object type IDs, pipeline stages, API patterns, and query recipes. Must be active before any HubSpot API call. |
| hubspot-hygiene-check | `Skill(pluginbrands-toolkit:hubspot-hygiene-check)` | Data cleanliness audit scoped to a named person. Checks deals, brands, and product pitches for missing values, stale descriptions, and structural issues. |

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
   "Skill(pluginbrands-toolkit:hubspot-hygiene-check)"
   ```

3. Restart Claude Code.
