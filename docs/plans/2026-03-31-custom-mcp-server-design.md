# Custom HubSpot MCP Server — Design

**Date:** 2026-03-31
**Status:** Approved

## Problem

HubSpot's official MCP server does not support custom objects. The entire PluginBrands data model relies on custom objects (Client Service `0-162`, Client Product `0-410`, Brand `0-970`, Product Pitch `0-420`), making the official MCP useless for most workflows.

With 5-6 team members using Claude via Cowork, we need a solution that:
- Centralises the HubSpot token (not on 6 laptops)
- Identifies who made each change
- Works with Cowork's custom connector UI (OAuth)

## Architecture

```
Cowork (per user) → OAuth → MCP Server (Railway) → HubSpot API
```

A standalone Node.js/TypeScript MCP server deployed on Railway. It holds the single HubSpot private app token. Each team member connects via Cowork's custom connector UI with their own OAuth Client ID and Secret.

### Components

- **OAuth layer** — Client credentials flow. Validates Client ID + Secret, issues a short-lived JWT (24hr expiry). A JSON config file maps Client IDs to user names and HubSpot owner IDs.
- **MCP tool layer** — 9 tools exposing generic HubSpot CRM operations.
- **HubSpot proxy** — Thin layer that adds auth headers, stamps `hubspot_owner_id` on writes, and forwards to the HubSpot CRM v3 API.
- **Logging** — Every tool call logged with user identity, tool name, object type, record IDs, and timestamp. Logs to stdout (Railway captures).

No database. User config is a static JSON file. The skills remain the knowledge layer — they tell Claude what to query and how to interpret results. The MCP server is just the transport.

## MCP Tools (9)

### Generic CRUD

| Tool | Purpose | HubSpot endpoint |
|------|---------|-----------------|
| `search_objects` | Search any object type with filters, sorts, property selection | `POST /crm/v3/objects/{objectType}/search` |
| `get_object` | Fetch one record by ID with specific properties | `GET /crm/v3/objects/{objectType}/{id}` |
| `create_object` | Create a record with properties (auto-stamps `hubspot_owner_id`) | `POST /crm/v3/objects/{objectType}` |
| `update_object` | Update properties on a record | `PATCH /crm/v3/objects/{objectType}/{id}` |
| `batch_read` | Fetch multiple records by ID in one call | `POST /crm/v3/objects/{objectType}/batch/read` |

### Associations

| Tool | Purpose | HubSpot endpoint |
|------|---------|-----------------|
| `get_associations` | Get records associated to a given record | `GET /crm/v3/objects/{objectType}/{id}/associations/{toObjectType}` |
| `create_association` | Link two records with a given association type | `PUT /crm/v4/objects/{objectType}/{id}/associations/{toObjectType}/{toId}` |

### Reference data

| Tool | Purpose | HubSpot endpoint |
|------|---------|-----------------|
| `list_pipelines` | Get all pipelines and stages for an object type | `GET /crm/v3/pipelines/{objectType}` |
| `list_owners` | Get all HubSpot owners | `GET /crm/v3/owners` |

## OAuth and User Configuration

### Auth flow

1. User adds custom connector in Cowork with their Client ID + Secret
2. Cowork sends token request to `POST /oauth/token` on the MCP server
3. Server validates credentials against config, returns a JWT (24hr expiry)
4. All subsequent MCP tool calls include this token
5. Server decodes token to identify user on every request

### User config (`users.json`)

```json
{
  "users": [
    {
      "client_id": "pb_danny_a1b2c3",
      "client_secret_hash": "...",
      "name": "Danny Armstrong",
      "hubspot_owner_id": "123456789"
    }
  ]
}
```

Secrets stored hashed (bcrypt). A CLI script generates credentials:

```bash
npm run add-user -- --name "Danny Armstrong" --hubspot-owner-id 123456789
```

Outputs Client ID and Secret once for distribution. Stores only the hash.

### Team member setup

Each person receives:
- The MCP server URL (same for everyone)
- Their personal Client ID and Client Secret
- Instruction: "Add custom connector in Cowork, paste these three values"

## Identity and Audit

Each OAuth Client ID maps to a HubSpot owner ID. On every `create_object` and `update_object` call, the server injects `hubspot_owner_id` so records appear as if created by that team member natively in HubSpot.

Server logs capture every operation with full user attribution for anything HubSpot's own audit trail doesn't distinguish.

## Deployment

- **Location:** Same Railway project as the catalog app, separate service
- **Source:** `mcp-server/` directory in this repo
- **URL:** e.g. `pluginbrands-mcp.up.railway.app`

### Environment variables (Railway)

| Variable | Purpose |
|----------|---------|
| `HUBSPOT_TOKEN` | Single HubSpot private app token |
| `JWT_SECRET` | For signing OAuth access tokens |

### Repo structure

```
mcp-server/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── auth.ts           # OAuth token endpoint + JWT validation
│   ├── tools/
│   │   ├── search-objects.ts
│   │   ├── get-object.ts
│   │   ├── create-object.ts
│   │   ├── update-object.ts
│   │   ├── batch-read.ts
│   │   ├── get-associations.ts
│   │   ├── create-association.ts
│   │   ├── list-pipelines.ts
│   │   └── list-owners.ts
│   ├── hubspot-client.ts # Thin HTTP wrapper for HubSpot API
│   └── logger.ts         # Request logging
├── users.json            # User credentials (hashed secrets) + owner ID mapping
├── package.json
├── tsconfig.json
└── Dockerfile
```

## Testing Strategy

### Test tiers

| Tier | Contents | Transport |
|------|----------|-----------|
| A | Base prompt + curl templates + token | curl |
| B | A + hubspot-api-query skill | curl |
| **C (new)** | Base prompt + skill (adapted for MCP) | MCP tools |

### What Tier C measures

Does the MCP transport match or beat Tier B's results while removing the need for a raw token in the prompt?

### What changes for Tier C

- The skill references MCP tool names instead of curl recipes
- No `HUBSPOT_TOKEN` in the system prompt
- The harness connects to the MCP server instead of injecting a token
- Same 13 processes, same verification actions, same teardown

### Test levels

1. **Unit tests** (no HubSpot) — Auth flow validation, owner ID stamping on writes, input validation, mocked HubSpot responses
2. **Tier C harness run** (live HubSpot) — All 13 existing test processes run against the MCP server. Compare scores to Tier A and B baselines.
3. **Manual Cowork test** — A team member adds the connector and runs client-summary end-to-end

### Success criteria

- Tier C scores >= Tier B (~4.6/5)
- Zero custom object access failures
- Non-technical user completes Cowork setup in under 2 minutes
- HubSpot records show correct owner attribution

## Skill updates

The existing skills currently teach Claude to use `curl` with `HUBSPOT_TOKEN`. Once the MCP server is live, the skills need updating to reference MCP tool names instead. The domain knowledge (object types, properties, filters, pipeline stages) stays the same.

## Decisions made

- **Full HubSpot proxy** (not custom-objects-only) — one server, one connector, simpler for non-technical users
- **Tier 1+2 tools only** (generic CRUD + reference data) — no high-level convenience tools. Skills orchestrate, server transports.
- **Per-user OAuth credentials** — each person gets their own Client ID + Secret, mapped to their HubSpot owner ID
- **Same repo, separate Railway service** — lives in `mcp-server/`, deploys independently from the catalog app
