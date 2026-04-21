# Add a Cowork User

End-to-end onboarding process for giving a new team member access to the PluginBrands HubSpot via Cowork (claude.ai).

Cowork users don't install Claude Code plugins. They get:
1. **OAuth credentials** for the HubSpot custom connector
2. **A zip of the plugin skill** to load as project knowledge so Claude has the CRM vocabulary

---

## Admin steps

### 1. Generate credentials

```bash
cd mcp-server
npm run add-user -- --name "Danny Armstrong" --hubspot-owner-id 123456789
```

Copy the output — this is the **only time** the plaintext Client Secret is shown:

```
Client ID:      pb_danny_a1b2c3d4e5f6
Client Secret:  secret_<32 hex chars>
```

The script (`mcp-server/src/cli/add-user.ts`):
- Generates `client_id = pb_<firstname>_<6 bytes hex>`
- Generates `client_secret = secret_<16 bytes hex>`
- Bcrypts the secret (cost 10) and appends `{client_id, client_secret_hash, name, hubspot_owner_id}` to `mcp-server/users.json`
- Prints the plaintext secret to stdout — never written to disk

**Get the `hubspot_owner_id` right.** Every record the user creates or updates in HubSpot will be stamped with this ID for attribution. Look it up in HubSpot (Settings → Users → the user's row) before running the script.

### 2. Commit and push `users.json`

```bash
git add mcp-server/users.json
git commit -m "access: add Danny Armstrong"
git push origin main
```

Railway auto-deploys on push. `users.json` is baked into the Docker image (`mcp-server/Dockerfile:14` → `COPY users.json ./`) and loaded once at container start (`src/index.ts:632-639`) — there is no hot-reload.

**Wait ~1–2 min for the deploy**, then verify:

```bash
curl https://disciplined-nurturing-production-776e.up.railway.app/health
# {"status":"ok"}
```

### 3. Build the skill zip

```bash
cd plugins
zip -r pluginbrands-toolkit-v1.2.0.zip pluginbrands-toolkit
```

Produces a zip with `SKILL.md`, `plugin.json`, `README.md`, and `.mcp.json`. The user will extract `SKILL.md` and upload it as Cowork project knowledge.

### 4. Send credentials + zip (out-of-band)

Use **Signal / 1Password shared vault / encrypted email** — never Slack DM or plain email. The Client Secret is bearer-equivalent until rotated.

Template message:

> **Subject: PluginBrands HubSpot access**
>
> Here's your access to the PluginBrands HubSpot via Claude.
>
> **Connector credentials** (for Cowork custom connector)
> - URL: `https://disciplined-nurturing-production-776e.up.railway.app/mcp`
> - Client ID: `pb_danny_a1b2c3d4e5f6`
> - Client Secret: `secret_...`
>
> **Plugin skill** (attached zip)
> Unzip and upload `pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md` as project knowledge in Cowork.
>
> Setup instructions: see `docs/processes/add-cowork-user.md` in the repo (the "User steps" section).

---

## User steps (share the section below with the new user)

### A. Add the HubSpot connector

1. Open **claude.ai** → click your profile (bottom-left) → **Customize**
2. **Connectors** → **+** → **Add custom connector**
3. Fill in:
   - **Name:** PluginBrands HubSpot
   - **URL:** `https://disciplined-nurturing-production-776e.up.railway.app/mcp`
4. Expand **Advanced** → paste:
   - **Client ID**
   - **Client Secret**
5. **Add**

Cowork runs the OAuth `client_credentials` flow (`mcp-server/src/index.ts:482-515`) and stores a 24h JWT. After this you should see 10 HubSpot tools available: `search_objects`, `get_object`, `create_object`, `update_object`, `batch_read`, `get_associations`, `create_association`, `list_pipelines`, `list_owners`, `archive_object`.

### B. Load the skill as project knowledge

1. Create (or open) a **Project** in Cowork — suggest naming it "PluginBrands CRM"
2. **Project knowledge** → **Add content** → upload `SKILL.md` from the zip (or drag the whole extracted `hubspot-api-query/` folder if Projects accepts folders)
3. In the project's **Custom instructions**, add:

   > Before any HubSpot query, consult the hubspot-api-query skill for object IDs and query patterns.

### C. First test

In the project, ask:

> Show me the 5 most recent Brand records.

Claude should call `search_objects` with `objectType: "0-970"` (the Brand object type ID from the skill). If Claude asks "what type is a Brand?", the skill didn't load — check the project knowledge upload.

---

## Operational notes

| Detail | Implication |
|---|---|
| JWT expires in 24h | Cowork silently re-auths using stored credentials — transparent to the user |
| No per-request auth UI | Unlike Claude Code (which uses `authorization_code` + PKCE with a browser login page), Cowork uses `client_credentials` — the secret lives in the connector config |
| `hubspot_owner_id` stamps attribution | Creates/updates show this user as the owner in HubSpot |
| Revoking access | Delete the user's entry from `users.json`, commit, push, wait for redeploy. The existing JWT remains valid up to 24h unless you rotate `JWT_SECRET` |
| Rotating a compromised secret | Remove the entry, run `add-user` again with the same name + owner ID, push, send new credentials |
| Plugin updates | Send the new zip when you ship a new version — project knowledge doesn't auto-update in Cowork |

## Troubleshooting

- **Connector add fails with 401** — Client Secret typo, or deploy hasn't rolled out yet. Re-check `/health` and retry.
- **Connector works but tools missing** — Cowork caches connector metadata; remove and re-add the connector.
- **Tool calls succeed but wrong owner stamped** — Wrong `hubspot_owner_id` at `add-user` time. Fix in `users.json`, commit, push. Past records keep the bad attribution.
- **Claude doesn't know object IDs** — Project knowledge not loaded, or chat is outside the project. Confirm the chat is inside the project that has `SKILL.md` uploaded.
