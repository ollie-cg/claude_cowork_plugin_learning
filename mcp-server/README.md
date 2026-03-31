# PluginBrands HubSpot MCP Server

Custom MCP server that gives the team AI-powered access to the full HubSpot CRM — including custom objects that HubSpot's official MCP doesn't support.

## Why this exists

HubSpot's official MCP server can't work with custom objects. The entire PluginBrands data model (Client Service, Client Product, Brand, Product Pitch) uses custom objects, making the official MCP useless. This server:

- Supports all object types, including custom objects via numeric IDs (e.g. `0-970` for Brand)
- Centralises the HubSpot token on the server — not on 6 laptops
- Identifies who made each change via per-user OAuth credentials
- Works with Cowork's custom connector UI

## Architecture

```
Cowork (per user) → OAuth (client credentials) → This server (Railway) → HubSpot CRM v3 API
```

The server holds the single HubSpot private app token. Each team member connects with their own OAuth Client ID and Secret, which maps to their HubSpot owner ID for record attribution.

## Quick start

```bash
# Install dependencies
npm install

# Set required environment variables
export HUBSPOT_TOKEN='pat-eu1-...'   # HubSpot private app token
export JWT_SECRET='some-random-secret'  # For signing OAuth access tokens

# Start the dev server (auto-reloads on changes)
npm run dev

# Or build and run production
npm run build
npm start
```

The server starts on port 3000 (override with `PORT` env var).

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check — returns `{"status":"ok"}` |
| `/oauth/token` | POST | Exchange client credentials for a JWT access token |
| `/mcp` | POST | MCP JSON-RPC (client-to-server messages) |
| `/mcp` | GET | MCP SSE stream (server-to-client notifications) |
| `/mcp` | DELETE | MCP session teardown |

## Adding team members

Each person needs a Client ID and Client Secret to connect. Generate them with:

```bash
npm run add-user -- --name "Danny Armstrong" --hubspot-owner-id 123456789
```

This prints the credentials once and stores only the bcrypt hash in `users.json`. Share the Client ID and Secret with the team member — they paste them into Cowork's custom connector UI along with the server URL.

To find someone's HubSpot owner ID: HubSpot Settings > Users & Teams > click the user > the ID is in the URL.

## Available MCP tools

| Tool | What it does |
|------|-------------|
| `search_objects` | Search any object type with filters, sorts, property selection |
| `get_object` | Fetch one record by ID |
| `create_object` | Create a record (auto-stamps `hubspot_owner_id` for attribution) |
| `update_object` | Update record properties (auto-stamps `hubspot_owner_id`) |
| `batch_read` | Fetch multiple records by ID in one call |
| `get_associations` | Get records associated to a given record |
| `create_association` | Link two records (uses HubSpot v4 associations API) |
| `list_pipelines` | Get all pipelines and stages for an object type |
| `list_owners` | Get all HubSpot owners |

Custom objects use numeric type IDs: `0-162` (Client Service), `0-410` (Client Product), `0-420` (Product Pitch), `0-970` (Brand). Standard objects use names: `contacts`, `companies`, `deals`.

## Auth flow

1. Team member adds custom connector in Cowork with their Client ID + Secret
2. Cowork sends `POST /oauth/token` with `grant_type: "client_credentials"`
3. Server validates credentials against `users.json`, returns a JWT (24hr expiry)
4. All subsequent MCP requests include the JWT as a Bearer token
5. Server decodes the JWT to identify the user and stamp their `hubspot_owner_id` on writes

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `HUBSPOT_TOKEN` | Yes | HubSpot private app token (single token for all users) |
| `JWT_SECRET` | Yes | Secret for signing/verifying OAuth access tokens |
| `PORT` | No | Server port (default: 3000) |

## Testing

```bash
npm test          # Run all 26 unit tests
npm run test:watch  # Watch mode
```

Tests mock the HubSpot API — no live API calls needed. See `src/__tests__/` for test files.

## Deployment

Deploys as a separate Railway service from the same repo. Railway auto-builds from the Dockerfile.

1. Create a new service in the Railway project, pointed at the `mcp-server/` directory
2. Set `HUBSPOT_TOKEN` and `JWT_SECRET` environment variables
3. Railway handles the rest (Dockerfile build, port binding, health checks at `/health`)

## Project structure

```
src/
  index.ts              # Express app, MCP session management, tool registration
  auth.ts               # OAuth credential validation + JWT issue/verify
  hubspot-client.ts     # Thin HTTP client for HubSpot CRM v3 API
  logger.ts             # Structured JSON logging to stdout
  tools/
    types.ts            # Shared ToolContext interface
    search-objects.ts   # POST /crm/v3/objects/{type}/search
    get-object.ts       # GET /crm/v3/objects/{type}/{id}
    create-object.ts    # POST /crm/v3/objects/{type} (stamps owner ID)
    update-object.ts    # PATCH /crm/v3/objects/{type}/{id} (stamps owner ID)
    batch-read.ts       # POST /crm/v3/objects/{type}/batch/read
    get-associations.ts # GET /crm/v3/objects/{type}/{id}/associations/{toType}
    create-association.ts # PUT /crm/v4/objects/{type}/{id}/associations/...
    list-pipelines.ts   # GET /crm/v3/pipelines/{type}
    list-owners.ts      # GET /crm/v3/owners
  cli/
    add-user.ts         # CLI script to generate user credentials
users.json              # User credentials (hashed secrets) + owner ID mapping
Dockerfile              # Multi-stage build for Railway
```
