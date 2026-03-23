# HubSpot API Connection

## Overview

This project connects to the PluginBrands HubSpot portal (`24916652`, EU datacenter) via the HubSpot REST API. The connection is **read-only** and used for querying CRM data — contacts, companies, deals, custom objects, and schemas.

## Authentication

We use a **HubSpot Private App Token (PAT)**. The `pat-` prefix confirms this is a Private App token, managed under Settings > Integrations > Private Apps in the HubSpot UI.

- **Token format:** `pat-eu1-...` (Private App Token)
- **Auth method:** Bearer token in the `Authorization` header
- **Datacenter:** EU (`eu1`)
- **Portal ID:** `24916652`

### How to authenticate API requests

```bash
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/contacts?limit=10"
```

### Token storage

The token is stored in the project `.env` file (gitignored):

```
HUBSPOT_TOKEN=pat-eu1-...
```

To load it in a shell session:

```bash
source .env && export HUBSPOT_TOKEN
```

### Token management

- **Rotate:** HubSpot UI > Settings > Integrations > Private Apps > select app > Rotate
- **Current key name:** "Ollie - Test"
- **Scopes:** Read-only across all CRM objects (contacts, companies, deals, custom objects, products, quotes, invoices, etc.)

## Scopes

The PAT has **read-only** access. It cannot create, update, or delete records. Key scopes include:

| Category | Scopes |
|----------|--------|
| Contacts | `crm.objects.contacts.read`, `crm.objects.contacts.sensitive.read`, `crm.objects.contacts.highly_sensitive.read` |
| Companies | `crm.objects.companies.read`, `crm.objects.companies.sensitive.read`, `crm.objects.companies.highly_sensitive.read` |
| Deals | `crm.objects.deals.read`, `crm.objects.deals.sensitive.read`, `crm.objects.deals.highly_sensitive.read` |
| Custom objects | `crm.objects.custom.read`, `crm.objects.custom.sensitive.read`, `crm.objects.custom.highly_sensitive.read` |
| Schemas | `crm.schemas.contacts.read`, `crm.schemas.companies.read`, `crm.schemas.deals.read`, `crm.schemas.custom.read`, etc. |
| Other objects | Products, quotes, invoices, line items, orders, services, appointments, forecasts, goals, leads, listings, courses, etc. |

## API base URL

All requests go to: `https://api.hubapi.com`

Common endpoints:

| Endpoint | Description |
|----------|-------------|
| `/crm/v3/objects/{objectType}` | List/search standard objects (contacts, companies, deals, products) |
| `/crm/v3/objects/{objectTypeId}` | List records for custom objects by numeric ID (e.g., `0-970`) |
| `/crm/v3/objects/{objectType}/{recordId}` | Get a single record by ID |
| `/crm/v3/objects/{objectType}/search` | Search with filters (POST) |
| `/crm/v3/properties/{objectType}` | List all properties for an object type |
| `/crm/v3/pipelines/{objectType}` | List pipelines and stages for an object type |
| `/crm/v3/owners` | List CRM owners/users |

## Object type IDs

The four "custom" entities in this portal are **repurposed native HubSpot object types**, not user-created custom objects. This means:

- `GET /crm/v3/schemas` returns empty (it only lists user-created `2-XXXXX` type custom objects)
- You **must** use the numeric `objectTypeId` to query them — name-based access (e.g., `/crm/v3/objects/brand`) does not work
- Standard objects can still be queried by name (e.g., `contacts`, `companies`, `deals`)

| Entity | objectTypeId | HubSpot Native Type | Records | Example API path |
|--------|-------------|---------------------|---------|-----------------|
| Contact | `0-1` | Contact | ~6,200 | `/crm/v3/objects/contacts` |
| Company | `0-2` | Company | ~2,250 | `/crm/v3/objects/companies` |
| Deal | `0-3` | Deal | ~1,478 | `/crm/v3/objects/deals` |
| **Client Service** | **`0-162`** | Service | 19 | `/crm/v3/objects/0-162` |
| **Client Product** | **`0-410`** | Course | 157 | `/crm/v3/objects/0-410` |
| **Product Pitch** | **`0-420`** | Listing | 6,229 | `/crm/v3/objects/0-420` |
| **Brand** | **`0-970`** | Project | 1,212 | `/crm/v3/objects/0-970` |
| Lead | `0-136` | Lead | — | `/crm/v3/objects/0-136` |

### Querying custom objects

```bash
# List Brand records with specific properties
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/0-970?limit=10&properties=buyer_name,client_name_sync,amount"

# Search Product Pitches
curl -X POST -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/0-420/search" \
  -d '{"filterGroups":[],"properties":["amount","client_name_sync"],"limit":10}'

# Get Brand Pipeline stages
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/crm/v3/pipelines/0-970"

# Get Client Product properties (67 fields)
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/crm/v3/properties/0-410"
```

### Pipeline IDs

| Object | Pipeline Name | Pipeline ID |
|--------|--------------|-------------|
| Deal | Buyer Deal Pipeline | `2760762586` |
| Deal | Client Deal Pipeline | `2760762585` |
| Client Service (`0-162`) | Service Pipeline | `ba9cdbd6-e220-45b2-a5a2-d67ebdcbade6` |
| Client Product (`0-410`) | Product Pipeline | `9dd7104c-1ae0-402b-a194-9cc567fd6a45` |
| Product Pitch (`0-420`) | Product Pitch Pipeline | `fdeea9a0-8d7e-4f9b-97b6-ca9a587eee87` |
| Brand (`0-970`) | Brand Pipeline | `139663aa-09ee-418e-b67d-c8cfcd3e5ce3` |
| Lead (`0-136`) | Buyer Pipeline | `2761663691` |
| Lead (`0-136`) | Client Lead Pipeline | `lead-pipeline-id` |

## Verified endpoints (2026-03-20)

All tested with the "Ollie - Test" PAT:

| Endpoint | Status |
|----------|--------|
| `GET /crm/v3/objects/{type}` | Works (all standard + custom objects) |
| `POST /crm/v3/objects/{type}/search` | Works |
| `GET /crm/v3/properties/{type}` | Works |
| `GET /crm/v3/pipelines/{type}` | Works |
| `GET /crm/v3/owners` | Works |
| `GET /crm/v3/schemas` | Returns empty (expected — not user-created custom objects) |

## Related documentation

- [hubspot-system-guide.md](./hubspot-system-guide.md) — Data model, entity relationships, and how operators use the system
- [hubspot-framework-testing-process.md](./hubspot-framework-testing-process.md) — Test harness for measuring LLM understanding of the HubSpot environment
