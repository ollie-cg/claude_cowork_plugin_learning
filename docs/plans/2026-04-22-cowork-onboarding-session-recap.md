# Cowork onboarding — session recap

**Date:** 2026-04-22
**Covers:** Work done 2026-04-21 → 2026-04-22
**Purpose:** Single reference for everything we shipped, decided, and learned in the session that took the plugin from v1.1.0 + 4 skills to v1.2.0 + 1 skill + per-user OAuth + first real Cowork onboarding (Charlie, Danny).

## TL;DR

- Cut **v1.2.0** — trimmed the plugin down to the `hubspot-api-query` foundation skill. Removed `client-summary`, `hubspot-hygiene-check`, `generate-buyer-deck`.
- Rearchitected the MCP server's `/authorize` flow so that **per-user sign-in works through Cowork Team/Enterprise org-level connectors**. Each team member signs in on our hosted login page with their own `pb_firstname_*` credentials; HubSpot attribution is preserved.
- Provisioned three users: **Ollie Gough**, **Charlie Knight**, **Danny Armstrong**. Credentials saved to `~/Downloads/*-credentials.md`.
- Wrote the end-to-end runbook at `docs/processes/add-cowork-user.md` with the admin-vs-user role split explained.
- Drafted email handoffs for Charlie and Danny in `~/Downloads/*-onboarding-email.md`.

Current outstanding issue at session end: Cowork members seeing "can't reach MCP server" — diagnosed as client-side (URL typo / stale state). Server verified healthy on all endpoints.

---

## 1. v1.2.0 release

### What shipped

| Change | Commit |
|---|---|
| Removed `client-summary/`, `hubspot-hygiene-check/`, `generate-buyer-deck/` skill directories | `8c6319b` |
| `plugin.json` bumped 1.1.0 → 1.2.0 | `8c6319b` |
| `marketplace.json` plugin entry bumped to 1.2.0 | `8c6319b` |
| Plugin README rewritten for single-skill install + permissions | `8c6319b` |
| Root README tree diagram + narrative trimmed | `8c6319b` |
| `DEPRIORITISED (2026-04-21, v1.2.0)` banner added to 8 design docs in `docs/plans/` | `8c6319b` |
| Tag `v1.2.0` pushed to origin | — |
| Stale zips at repo root + `mcp-server/` removed | `8c6319b` |

Semver note: a skill removal is technically breaking, so a major version bump (2.0.0) is the strict reading. We chose 1.2.0 as a pragmatic minor bump because usage is internal and the impact is limited to a handful of teammates with the skills already permissioned.

### Files the plugin ships in v1.2.0

```
pluginbrands-toolkit/
├── .claude-plugin/plugin.json
├── .mcp.json
├── README.md
└── skills/
    └── hubspot-api-query/
        └── SKILL.md
```

Zip location: `~/Downloads/pluginbrands-toolkit-v1.2.0.zip` (10 KB). Same zip is valid for every team member until the next version bump.

---

## 2. Per-user OAuth sign-in (architecture change)

### The gap we closed

Before: `/authorize` treated the URL's `client_id` as user identity. If a Cowork org Owner pre-filled a single Client ID at the connector config, every team member authenticating through that connector would appear as the same HubSpot user.

After: `/authorize` separates "OAuth app identity" (URL's `client_id`, for RFC 6749 token-exchange matching) from "user identity" (typed into the login form, validated against `users.json`).

### What changed in code

| File | Change |
|---|---|
| `mcp-server/src/index.ts` | `AuthCodeEntry.user` gained `client_id`; `loginPage()` renders visible Client ID + Client Secret fields and a hidden `app_client_id` passthrough; GET `/authorize` no longer validates the URL's client_id against users.json; POST `/authorize` uses `app_client_id` for OAuth-app identity while the user's submitted form credentials carry user identity; JWT issued with `entry.user.client_id` |
| `mcp-server/src/__tests__/authorize.test.ts` | Old user-personalization test assertions replaced; new test proves two users authenticating through the same `app_client_id` get distinct JWTs |
| `docs/processes/add-cowork-user.md` | Rewritten for org-admin-plus-per-user flow |
| `docs/plans/2026-04-21-per-user-oauth-design.md` | New design explainer |

Shipped as commit **`f4637b9`** → origin/main. Verified live on Railway after ~40s deploy.

### What's backward-compatible

- `client_credentials` grant (Claude Code flow) is untouched
- JWT claim shape unchanged (`client_id`, `name`, `hubspot_owner_id`)
- `users.json` schema unchanged — no migration
- Tests that POST `/authorize` with just `client_id` + `client_secret` (old direct flow) still pass because the POST handler falls back to using the form's `client_id` as both app and user identity

### What was NOT implemented (left for future)

- Dynamic Client Registration (RFC 7591) — noted in the design doc as the long-term standards-compliant answer if a second workspace ever needs to register itself as a distinct app
- Refresh tokens — we issue 24h access tokens; Anthropic re-initiates sign-in when they expire
- Per-user revocation — currently only `JWT_SECRET` rotation invalidates issued tokens

---

## 3. Users provisioned

All three via `npm run add-user` inside `mcp-server/`. `users.json` now contains exactly these three entries.

| Name | HubSpot Owner ID | Client ID | Commit |
|---|---|---|---|
| Ollie Gough | 33030680 | `pb_ollie_c6f5556f1b86` | `f519738` |
| Danny Armstrong | 29590940 | `pb_danny_3227bc7a0df3` | `ef06b34` |
| Charlie Knight | 118594265 | `pb_charlie_bdbc8ef60af1` | `f0ba1e9` |

HubSpot owner IDs for Danny and Charlie were looked up via the HubSpot REST API using `HUBSPOT_TOKEN` from the local `.env`:

```bash
set -a && source .env && set +a
curl -s -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/crm/v3/owners?limit=100" | python3 -c "..."
```

Plaintext secrets persisted in `~/Downloads/<name>-pluginbrands-credentials.md` (one file per user). These are the only copies — `users.json` stores only bcrypt hashes.

---

## 4. Final onboarding flow

### Role split

| Actor | Role | Action | When |
|---|---|---|---|
| Cowork Owner (Charlie) | Admin | Register connector at **Organization settings → Connectors** — URL + Name only, OAuth fields blank | Once per workspace |
| Cowork Owner (same person) | User | Click Connect on their own Cowork account, sign in with personal `pb_charlie_*` credentials | Once, after admin step |
| Admin running `add-user` (Ollie) | User | Same Connect flow as any member | Once, after admin step |
| Each team member (Danny, etc.) | User | Same Connect flow — with their own `pb_firstname_*` credentials | Whenever onboarded |

**Anthropic's definitive quote:** *"Enabling a connector makes it available to your team, but it doesn't automatically grant anyone access. Each person still needs to authenticate individually before they can use it."* Adding the connector and using the connector are two different things. Every user — Owner included — has to Connect personally.

### What each user does

1. Open claude.ai → **Customize → Connectors**
2. Find **PluginBrands HubSpot** (with a "Custom" label) — registered by Charlie at org level
3. Click **Connect**
4. Redirected to our `/authorize` login page (hosted on Railway, dark theme, "Sign in — PluginBrands HubSpot")
5. Enter their **Client ID** and **Client Secret** (from the credentials email)
6. Click **Sign in** — browser redirects back to Cowork; connector shows **Connected**
7. Create a Cowork Project ("PluginBrands CRM" suggested) and upload `SKILL.md` from the zip as project knowledge
8. Smoke test: `"Show me my 5 most recent deals"` — Claude should return a real list

### Order of operations for a new onboarding

```
1. Admin (Ollie) runs add-user CLI
2. Admin commits + pushes users.json
3. Admin verifies Railway deploy + that new creds return a JWT at /oauth/token
4. Admin builds/confirms the plugin zip
5. Admin sends email with creds + zip attached
6. User follows the Cowork steps above
```

Ordering rule: **never send credentials before the Railway deploy is verified live.** Cowork returning "can't reach MCP server" after a premature send looks like a broken system to the user; verification with a curl `/oauth/token` call takes <30 seconds.

---

## 5. Known issues at session end

### Issue: "contact your admin for help" on connector

**Cause:** Cowork capability toggled off at org level.

**Fix:** Charlie → Organization settings → Capabilities → flip **Cowork** to ON. If on Enterprise, check role/group scoping too.

### Issue: "Can't reach MCP server"

**Server verified healthy** end-to-end — all 5 endpoints return correct status codes when probed directly. This is client-side.

**Most likely causes, in order:**
1. **URL typo in connector config** — missing `/mcp`, wrong hostname, trailing whitespace, smart quotes
2. **Stale connector state** — remove and re-add cleanly
3. **Wrong workspace** — connector added in a different workspace than the one members are using

**Correct URL:**

```
https://disciplined-nurturing-production-776e.up.railway.app/mcp
```

---

## 6. Key files and locations

### In the repo

| File | Purpose |
|---|---|
| `mcp-server/src/index.ts` | MCP server entry point — OAuth endpoints, tool registration, `/authorize` login page |
| `mcp-server/src/auth.ts` | `validateCredentials`, JWT issue/verify |
| `mcp-server/src/cli/add-user.ts` | CLI that generates user credentials and appends to users.json |
| `mcp-server/users.json` | User registry (bcrypt hashes) |
| `mcp-server/Dockerfile` | Builds Railway image; bakes `users.json` in at line 14 |
| `plugins/pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md` | The CRM vocabulary skill (18 KB) |
| `plugins/pluginbrands-toolkit/.mcp.json` | MCP server binding for Claude Code plugin install |
| `.claude-plugin/marketplace.json` | Marketplace manifest (version synced with plugin.json) |
| `docs/processes/add-cowork-user.md` | Onboarding runbook — admin + user steps + troubleshooting |
| `docs/plans/2026-04-21-per-user-oauth-design.md` | OAuth design explainer |
| `docs/plans/2026-04-22-cowork-onboarding-session-recap.md` | This file |

### In `~/Downloads/`

| File | Purpose |
|---|---|
| `pluginbrands-toolkit-v1.2.0.zip` | Plugin zip — attach to every onboarding email until the next version bump |
| `ollie-gough-pluginbrands-credentials.md` | Not created this session but Ollie's creds are in the email drafts |
| `danny-armstrong-pluginbrands-credentials.md` | Admin reference for Danny |
| `danny-onboarding-email.md` | Copy-paste email body for Danny |
| `charlie-knight-pluginbrands-credentials.md` | Admin reference for Charlie |
| `charlie-onboarding-email.md` | Copy-paste email body for Charlie |

### External

| Resource | URL |
|---|---|
| Railway MCP server | `https://disciplined-nurturing-production-776e.up.railway.app/mcp` |
| Railway health check | `https://disciplined-nurturing-production-776e.up.railway.app/health` |
| GitHub repo | `ollie-cg/claude_cowork_plugin_learning` |

---

## 7. Commits from this session

In chronological order, all pushed to `origin/main`:

| Commit | Title |
|---|---|
| `8c6319b` | feat(plugin): trim to foundation skill, cut v1.2.0 |
| `ecab414` | docs(process): add Cowork user onboarding runbook |
| `f519738` | access: reset users, re-add Ollie Gough |
| `ef06b34` | access: add Danny Armstrong |
| `f4637b9` | feat(mcp): per-user sign-in on the authorize login page |
| `f0ba1e9` | access: add Charlie Knight |
| `693bb5d` | docs(process): add setup timeline clarifying owner vs user roles |

Plus tag **`v1.2.0`** pointing at `8c6319b`.

---

## 8. Decisions made this session (and why)

| Decision | Rationale |
|---|---|
| Ship v1.2.0 as a minor bump despite being a breaking skill removal | Internal team tool; small known audience; minor bump was pragmatic |
| Delete 3 skills entirely rather than archive | Git history preserves them; keeping dead code in the working tree is noise |
| Add DEPRIORITISED banner to design docs instead of moving/deleting them | Preserves learning artifacts while making their status visible |
| Support per-user sign-in via login-page rewrite instead of Dynamic Client Registration | Smallest change to unblock Cowork Team/Enterprise onboarding; DCR is future work |
| Own our login page (served from Railway) instead of using `oauth_anthropic_creds` | Keeps Anthropic out of the credential flow; enables per-user identity capture that `oauth_anthropic_creds` explicitly doesn't support (GitHub issue #44980) |
| Reuse one zip across all users on the same plugin version | Zip only changes on plugin version bump; no per-user customization needed |
| Use `~/Downloads/` for credentials in plain markdown instead of 1Password | User preference (session-specific — revisit for external contractors) |
| Send credentials inline in email rather than out-of-band | User explicitly opted into this; acceptable for internal PluginBrands team |

---

## 9. Known architectural debt + next moves

- **Dynamic Client Registration** — if we ever distribute this to a second Cowork workspace, we may want each workspace to have a distinct app identity. Currently any URL `client_id` is accepted; DCR would let each workspace register itself.
- **Refresh tokens** — 24h access token expiry means users sign in once a day. Not a blocker but surfaces the login page more than necessary.
- **Per-user revocation** — no way to kill an individual JWT short of rotating `JWT_SECRET` (which logs everyone out).
- **Plugin marketplace alternative** — `Organization settings → Plugins` supports ZIP upload of plugins org-wide. Not used yet; worth exploring as an alternative distribution path if the connector route keeps hitting Cowork's admin-approval quirks.
- **Custom objects in the official HubSpot MCP** — HubSpot's own MCP doesn't currently support custom objects, which is why we maintain our own. Worth monitoring for changes; if they add custom object support it would be a reason to reconsider our architecture.
