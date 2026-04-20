# PluginBrands Toolkit

Claude Code plugin for PluginBrands HubSpot CRM operations.

## Skills

| Skill | Invoke with | Purpose |
|-------|------------|---------|
| hubspot-api-query | `Skill(pluginbrands-toolkit:hubspot-api-query)` | CRM data model, object type IDs, pipeline stages, API patterns, and query recipes. Must be active before any HubSpot API call. |
| hubspot-hygiene-check | `Skill(pluginbrands-toolkit:hubspot-hygiene-check)` | Data cleanliness audit scoped to a named person. Checks deals, brands, and product pitches for missing values, stale descriptions, and structural issues. |
| generate-buyer-deck | `Skill(pluginbrands-toolkit:generate-buyer-deck)` | Generates tailored Gamma sales decks for retail buyers. Orchestrates HubSpot buyer intelligence, Catalog App product data, and Gamma MCP with automated Puppeteer visual QA. |
| client-summary | `Skill(pluginbrands-toolkit:client-summary)` | Summarises a client's pipeline — buyer breakdown, deal stages, product counts, and recent activity. |

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
- `GAMMA_API_KEY` environment variable (set)
- `CATALOG_APP_URL` environment variable (set)
- Puppeteer MCP tools (optional — for visual QA)

Workflow:
1. Gathers buyer intelligence from HubSpot (emails, notes, calls, deals)
2. Proposes buyer motives for user validation
3. Presents brand and product selection from the Catalog App
4. Crafts a tailored narrative for the deck
5. Generates via Gamma API with `chimney-dust` theme
6. Runs visual QA with Puppeteer, auto-retries up to 2x if issues found

### Client Summary

Run by asking:
- "Summarise MOJU"
- "How is Grind doing?"
- "Client summary for X"
- "Review the pipeline for Y"

Requires:
- `hubspot-api-query` skill (active)

Workflow:
1. Resolves client by name from Client Services
2. Asks whether to include per-team-member breakdown
3. Fetches brands, deduplicates, and resolves underlying deals
4. Fetches recent meetings and notes
5. Renders pipeline table and activity summary

## Setup

### Install

Via slash command:

```
/plugin marketplace add ollie-cg/claude_cowork_plugin_learning@v1.0.0
/plugin install pluginbrands-toolkit@pluginbrands-marketplace
```

Or commit this to a shared project's `.claude/settings.json` for team-wide install (teammates get a single trust prompt when they open the repo):

```json
{
  "extraKnownMarketplaces": {
    "pluginbrands-marketplace": {
      "source": { "source": "github", "repo": "ollie-cg/claude_cowork_plugin_learning", "ref": "v1.0.0" }
    }
  },
  "enabledPlugins": {
    "pluginbrands-toolkit@pluginbrands-marketplace": true
  }
}
```

To upgrade, bump the `ref` to the new tag and run `/plugin marketplace update`.

### Grant skill permissions

Add to `.claude/settings.local.json`:

```json
"Skill(pluginbrands-toolkit:hubspot-api-query)",
"Skill(pluginbrands-toolkit:hubspot-hygiene-check)",
"Skill(pluginbrands-toolkit:generate-buyer-deck)",
"Skill(pluginbrands-toolkit:client-summary)"
```

Restart Claude Code.

### Environment variables

Set these in your shell — they are **not** distributed with the plugin:

- `HUBSPOT_TOKEN` — HubSpot private app token
- `GAMMA_API_KEY` — Gamma API key (required by `generate-buyer-deck`)
- `CATALOG_APP_URL` — Catalog App base URL (required by `generate-buyer-deck`)

## Releasing a new version

1. Bump `version` in `.claude-plugin/plugin.json` and the matching entry in the repo-root `.claude-plugin/marketplace.json`.
2. Commit to `main` and push.
3. Tag and push:

   ```
   git tag -a vX.Y.Z -m "pluginbrands-toolkit vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. Teammates pick up the new version by updating the pinned `ref` in their `settings.json` (or re-running `/plugin marketplace add` with the new tag).
