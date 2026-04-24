# PluginBrands Toolkit

Claude Code plugin for PluginBrands HubSpot CRM operations.

## Skills

| Skill | Invoke with | Purpose |
|-------|------------|---------|
| hubspot-api-query | `Skill(pluginbrands-toolkit:hubspot-api-query)` | CRM data model, object type IDs, pipeline stages, API patterns, and query recipes. Must be active before any HubSpot API call. |

## Usage

### HubSpot API Query

Loaded automatically when working with HubSpot data. Provides object type IDs for custom objects (Brand `0-970`, Product Pitch `0-420`, Client Service `0-162`, Client Product `0-410`), pipeline stage mappings, automation chain documentation, and common query recipes.

## Setup

### Install

Via slash command:

```
/plugin marketplace add ollie-cg/claude_cowork_plugin_learning@v1.2.0
/plugin install pluginbrands-toolkit@pluginbrands-marketplace
```

Or commit this to a shared project's `.claude/settings.json` for team-wide install (teammates get a single trust prompt when they open the repo):

```json
{
  "extraKnownMarketplaces": {
    "pluginbrands-marketplace": {
      "source": { "source": "github", "repo": "ollie-cg/claude_cowork_plugin_learning", "ref": "v1.2.0" }
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
"Skill(pluginbrands-toolkit:hubspot-api-query)"
```

Restart Claude Code.

### HubSpot access (v1.1.0+)

The plugin binds to the PluginBrands MCP server (`.mcp.json` → `https://disciplined-nurturing-production-776e.up.railway.app/mcp`). The server holds the HubSpot token — **users do not set `HUBSPOT_TOKEN` locally**.

Each user needs their own OAuth Client ID + Secret. An admin provisions them:

```
cd mcp-server
npm run add-user -- --name "Full Name" --hubspot-owner-id <their-hubspot-owner-id>
git add users.json && git commit -m "access: add Full Name" && git push
```

The command prints the plaintext Client Secret **once**. Send the Client ID + Secret to the user out-of-band.

- **Claude Code users:** On first tool call, Claude prompts for OAuth via the server's browser login page. User pastes their Client Secret.
- **Cowork users:** Customize → Connectors → + → Add custom connector → URL `https://disciplined-nurturing-production-776e.up.railway.app/mcp` → Advanced → paste Client ID + Secret.

## Releasing a new version

1. Bump `version` in `.claude-plugin/plugin.json` and the matching entry in the repo-root `.claude-plugin/marketplace.json`.
2. Commit to `main` and push.
3. Tag and push:

   ```
   git tag -a vX.Y.Z -m "pluginbrands-toolkit vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. Teammates pick up the new version by updating the pinned `ref` in their `settings.json` (or re-running `/plugin marketplace add` with the new tag).

## Version history

- **v1.2.0** — Trimmed to foundation skill only. Removed `client-summary`, `hubspot-hygiene-check`, `generate-buyer-deck`.
- **v1.1.0** — Bound plugin to Railway MCP server for HubSpot auth.
- **v1.0.0** — Initial release with 4 skills.
