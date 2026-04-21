# Add a Cowork User

End-to-end onboarding process for giving a new team member access to the PluginBrands HubSpot via Cowork (claude.ai) — Team / Enterprise workspace.

The team member gets:
1. **Personal OAuth credentials** (Client ID + Secret) that they type into our login page at Connect time
2. **A zip of the plugin skill** to load as Cowork project knowledge so Claude has the CRM vocabulary

> **Prerequisite (one-time per Cowork workspace):** A Cowork workspace **Owner** must register the PluginBrands HubSpot connector at the org level before any member can connect. See [Org owner setup](#org-owner-setup-one-time) below.

---

## Admin steps (every new user)

### 1. Find the user's HubSpot owner ID

Look up their numeric `owner_id` in HubSpot. Easiest: call the owners API directly with the admin HubSpot token from the project root `.env`:

```bash
set -a && source .env && set +a
curl -s -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/crm/v3/owners?limit=100" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); \
    print([o for o in d['results'] if 'NAME' in (o.get('firstName','')+' '+o.get('lastName','')).lower()])"
```

Replace `NAME` with the user's first name. Confirm the returned record matches their email.

### 2. Generate credentials

```bash
cd mcp-server
npm run add-user -- --name "Full Name" --hubspot-owner-id <numeric id>
```

Copy the output — this is the **only time** the plaintext Client Secret is shown:

```
Client ID:      pb_<firstname>_<hex>
Client Secret:  secret_<hex>
```

Appends a bcrypt hash of the secret to `mcp-server/users.json`.

### 3. Commit and push `users.json`

```bash
git add mcp-server/users.json
git commit -m "access: add Full Name"
git push origin main
```

Railway auto-deploys on push. `users.json` is baked into the Docker image (`mcp-server/Dockerfile`) and loaded once at container start — restart/redeploy is required for changes.

### 4. Verify the deploy is live

Test OAuth with the new creds before sending them to the user — prevents support tickets from premature clicks.

```bash
curl -s -X POST https://disciplined-nurturing-production-776e.up.railway.app/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=pb_firstname_xxx&client_secret=secret_yyy"
```

Expected: `{"access_token":"...","token_type":"bearer","expires_in":86400}`.
Wrong: `{"error":"invalid_client"}` — deploy not live yet; retry in ~30s.

### 5. Build the skill zip

Can run in parallel with steps 3–4.

```bash
cd plugins
zip -r ~/Downloads/pluginbrands-toolkit-vX.Y.Z.zip pluginbrands-toolkit
```

### 6. Send credentials + zip to the user

Via whatever channel you prefer (our risk tolerance is email for internal team; use Signal/1Password for external contractors). See the email template in [`/Users/ollie/Downloads/danny-onboarding-email.md`](../../../Users/ollie/Downloads/danny-onboarding-email.md) for an example.

Must include:
- **MCP URL:** `https://disciplined-nurturing-production-776e.up.railway.app/mcp`
- **Client ID** + **Client Secret** (from step 2)
- **Attached zip** (from step 5)
- **Setup instructions** (see [User steps](#user-steps) below)

---

## Org-owner setup (one-time)

This is done **once per Cowork workspace**, by the workspace **Owner** (not regular members).

On Team/Enterprise plans, custom connectors must be registered at the organization level by an Owner before members can connect. Members without Owner permissions see no "+ Add custom connector" button in their own `Customize → Connectors` — they can only connect to connectors the Owner has registered.

### Steps

1. Open claude.ai → **Organization settings → Connectors**
2. Click **Add**
3. Hover **Custom** → select **Web**
4. **URL:** `https://disciplined-nurturing-production-776e.up.railway.app/mcp`
5. **Name:** PluginBrands HubSpot
6. **Advanced settings:** leave **both OAuth fields blank** — per-user credentials are entered at Connect time on our login page (see [Architecture](../plans/2026-04-21-per-user-oauth-design.md))
7. Click **Add**

The connector now shows up in every member's `Customize → Connectors` with a "Custom" label and a **Connect** button.

---

## User steps (share this section with the new user)

### A. Connect to the PluginBrands HubSpot connector

1. Open claude.ai → profile (bottom-left) → **Customize → Connectors**
2. Find **PluginBrands HubSpot** (marked with a "Custom" label — your admin added this at the org level)
3. Click **Connect**
4. You'll be redirected to a PluginBrands sign-in page. Enter:
   - **Client ID:** (from the email — e.g. `pb_firstname_...`)
   - **Client Secret:** (from the email — e.g. `secret_...`)
5. Click **Sign in**

Claude handshakes with the PluginBrands server, issues a 24-hour token, and closes the flow. You should now see 10 HubSpot tools available: `search_objects`, `get_object`, `create_object`, `update_object`, `batch_read`, `get_associations`, `create_association`, `list_pipelines`, `list_owners`, `archive_object`.

### B. Load the skill as project knowledge

1. Create (or open) a **Project** — suggest naming it "PluginBrands CRM"
2. Unzip the attached `pluginbrands-toolkit-vX.Y.Z.zip`
3. **Project knowledge → Add content** → upload `pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md`
4. In the project's **Custom instructions**, paste:

   > Before any HubSpot query, consult the hubspot-api-query skill for object IDs and query patterns.

### C. First test

In the project, ask:

> Show me the 5 most recent Brand records.

Claude should call `search_objects` with `objectType: "0-970"` (the Brand object type ID from the skill). If Claude asks "what type is a Brand?", the skill didn't load — check the project knowledge upload.

---

## Operational notes

| Detail | Implication |
|---|---|
| JWT expires in 24h | Cowork silently re-auths using stored session state — transparent to the user until 24h elapses, then a re-sign-in is triggered |
| Per-user login on our domain | Each member enters their own `pb_*` Client ID + Secret on our server's sign-in page. Anthropic never sees plaintext credentials — they travel only between the user's browser and our Railway-hosted server |
| `hubspot_owner_id` attribution | Every record Danny creates is stamped with his owner_id. Wrong owner_id = wrong attribution on every record |
| Revoking access | Delete the entry from `users.json`, push, wait for redeploy. Existing JWT remains valid up to 24h unless `JWT_SECRET` is rotated in Railway env |
| Rotating a compromised secret | Remove + re-run `add-user` with the same name/owner. Issue a new email with new creds |
| Plugin skill updates | Send the new zip when a new version ships; Cowork project knowledge does not auto-update |

## Troubleshooting

- **Member sees no PluginBrands HubSpot connector** — Owner hasn't registered it at org level, OR member is on a different workspace than the one where it was registered. Verify with the workspace Owner.
- **Sign-in page returns "Invalid Client ID or Secret"** — typo in either field; re-check. If confirmed correct, verify `users.json` was pushed + deploy went live (step 4 above).
- **Connector shows connected but tools missing** — Cowork caches metadata per session; disconnect and reconnect the connector from `Customize → Connectors`.
- **Tool calls succeed but wrong owner stamped on records** — `hubspot_owner_id` was set wrong at `add-user` time. Fix in `users.json`, commit, push. Past records keep the bad attribution.
- **Claude doesn't know custom object IDs** — project knowledge not loaded, or the chat is outside the project. Confirm the chat is inside the project with `SKILL.md` uploaded.
