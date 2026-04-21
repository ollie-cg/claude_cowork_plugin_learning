# Per-user OAuth for the PluginBrands MCP server

**Date:** 2026-04-21
**Status:** Implemented (v1.2.x of `mcp-server`)

Design explainer for the change that separates "OAuth app identity" from "user identity" in the MCP server's `/authorize` flow. The change unblocks onboarding team members via Cowork Team/Enterprise custom connectors while preserving per-user HubSpot attribution.

## Why this change

### What we had

Before this change, the `/authorize` login page took `client_id` from the URL query string and treated it as user identity. Our `users.json` registry mapped each `client_id` to a specific team member (`pb_danny_<hex>` → Danny, `pb_ollie_<hex>` → Ollie). The login form only asked for a Client Secret — the Client ID was pre-filled as a hidden input.

That worked fine for Claude Code's `client_credentials` flow (each user's laptop has the plugin configured with their personal credentials) and for direct authorization_code flows where the user hits `/authorize?client_id=pb_ollie_...` directly.

### The blocker

Cowork on Team / Enterprise plans requires custom connectors to be added at the **organization level by a workspace Owner**. The Owner enters one OAuth Client ID into the connector config. Every member who clicks **Connect** on that connector is redirected to our `/authorize?client_id=<owner-configured-id>`. In our old model, all members would authenticate as whichever single user's Client ID the Owner had configured — breaking per-user attribution.

This matched the behavior flagged in [anthropics/claude-code#44980](https://github.com/anthropics/claude-code/issues/44980) as a broader gap in how Claude custom connectors handle per-user identity.

### Design goal

Enable Cowork org-level connector distribution while keeping each team member's actions attributed to them personally in HubSpot. Do it within our existing server — no new infrastructure, no dependency on Anthropic adding per-user scoping, and no migration of `users.json`.

## The design

Split the meaning of `client_id` into two independent concepts:

| Concept | Where it lives | What it represents |
|---|---|---|
| **OAuth app client_id** | URL query string at `/authorize`; stored as `AuthCodeEntry.clientId` | The registered OAuth client that Cowork speaks as — one per Cowork workspace. Required by RFC 6749 for token-exchange matching. Any value accepted; we don't validate it against `users.json`. |
| **User client_id** | Form body submitted by the user at sign-in; stored as `AuthCodeEntry.user.client_id` | The individual team member's credential (`pb_firstname_<hex>`). Validated against `users.json`. Identifies the human performing the action. |

### Flow

1. Cowork (on behalf of a member) redirects to `GET /authorize?client_id=<cowork-app-id>&...`
2. Our server renders a generic "Sign in to PluginBrands HubSpot" page with **both** Client ID and Client Secret as visible, required inputs — and a hidden `app_client_id` that passes the URL's client_id through
3. Member types their personal Client ID + Secret (from the credentials email) and submits
4. `POST /authorize` validates the user's credentials against `users.json`, creates an auth code bound to `{appClientId, user.client_id, user.name, user.hubspot_owner_id}`
5. Redirect to the Cowork callback with `code=...`
6. Cowork exchanges the code at `/oauth/token`, sending the app's Client ID. We match it against `AuthCodeEntry.clientId` (the one from step 1) — standard RFC 6749 behavior
7. JWT issued with `{client_id: user.client_id, name: user.name, hubspot_owner_id: user.hubspot_owner_id}` — every downstream tool call is attributed to the member who signed in

### Backward compatibility

- **Client Code users (direct `client_credentials` flow via `.mcp.json`)** — unchanged. The `/oauth/token` client_credentials handler was not modified.
- **Direct authorization_code POSTs without the new `app_client_id` field** — the POST handler falls back to using the form's `client_id` as both app and user identity, preserving the old semantics for any test or external caller that already works.
- **`users.json` schema** — unchanged. No migration needed.
- **JWT claim shape** — unchanged. Same three claims (`client_id`, `name`, `hubspot_owner_id`). Tool-call attribution code is untouched.

## Changes made

### `mcp-server/src/index.ts`

- `AuthCodeEntry.user` gained a `client_id` field so the user's Client ID can be preserved separately from the app's
- `loginPage()` rewritten: visible Client ID + Client Secret fields; hidden `app_client_id` passthrough; removed pre-login user lookup personalization
- `GET /authorize` no longer rejects unknown URL client_ids (they represent OAuth apps, not users)
- `POST /authorize` reads `app_client_id` from the form body with a fallback to the form's `client_id`, and carries the user's `client_id` through into `AuthCodeEntry.user`
- `/oauth/token` authorization_code branch issues the JWT with `entry.user.client_id` so attribution in tool calls stays accurate
- Added a small `escapeAttr()` helper to HTML-escape the values written into hidden input fields

### `mcp-server/src/__tests__/authorize.test.ts`

- Replaced the "returns login form for valid client_id" / "returns 400 for unknown client_id" pair with tests that reflect the new semantics (any URL client_id accepted, no user personalization)
- Added a two-user test proving that a single `app_client_id` can be used by multiple members and each gets a JWT attributed to them

### Docs

- `docs/processes/add-cowork-user.md` rewritten with the org-owner-one-time-setup step and the new member sign-in flow
- This design doc

## Operational implications

- **Anthropic never sees plaintext member credentials.** The sign-in page is served from our Railway-hosted `/authorize` endpoint on `disciplined-nurturing-production-776e.up.railway.app`; member credentials travel only between their browser and our server.
- **HTTPS everywhere** — traffic from Anthropic to our server is HTTPS (Railway default). Members enter their credentials into a TLS-secured form we control.
- **Bcrypt at rest** — `users.json` stores only bcrypt hashes (cost 10); our `validateCredentials` uses `compareSync`. No plaintext secrets are persisted on the server.
- **No DCR or CIMD yet** — we don't implement Dynamic Client Registration (RFC 7591) or Client ID Metadata Documents. If Cowork workspaces ever demand one of those auth types, we'd add the corresponding endpoint; for now, Cowork is happy to issue the `authorization_code` flow against our existing discovery endpoints.

## Risks and what we watched for

| Risk | Mitigation |
|---|---|
| Breaking Claude Code users mid-session | Kept the `client_credentials` grant handler untouched; shipped tests continue to exercise it |
| Token-exchange `client_id` mismatch if Cowork passes a different value at `/oauth/token` vs `/authorize` | `AuthCodeEntry.clientId` is set from the URL's `client_id` (via `app_client_id` passthrough) so it matches what Cowork sends at exchange |
| XSS in the hidden-input passthrough | Added `escapeAttr()` to HTML-encode quotes, ampersands, and `<` in every value we write into the login page |
| Users accidentally pasting their Client Secret into the Client ID field | Honest answer: there's no protection against this beyond the `pb_...` placeholder hint. If it becomes a pattern, add a server-side format check (reject secrets that look like `secret_...` in the `client_id` field) |

## Future work, not done here

- **Dynamic Client Registration** — if a second Cowork workspace wants to add the connector, today they'd share the same `app_client_id` (arbitrary, whatever the Owner enters). If we ever want per-workspace app identity (so we can log *which workspace* a session came from), add a `/register` endpoint following RFC 7591 and advertise it in `/.well-known/oauth-authorization-server`.
- **Refresh tokens** — we currently issue 24-hour access tokens with no refresh. Anthropic auto-reinitiates the sign-in flow when tokens expire, which is acceptable but surfaces the login page to users once a day. Adding `refresh_token` grant support would eliminate that.
- **Logout / session revocation** — no way to kill an active JWT short of rotating `JWT_SECRET` (which logs everyone out). If a team member leaves, we'd want per-user revocation.
