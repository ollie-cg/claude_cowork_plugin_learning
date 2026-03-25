---
name: hubspot-api-query
description: MUST USE for ANY HubSpot query, API call, data retrieval, report building, entity lookup, or question about the PluginBrands CRM. Activate this skill BEFORE making any curl call to HubSpot. If the task involves HubSpot data in any way, use this skill.
---

# HubSpot API Query — PluginBrands

## Iron Law

**NEVER query custom objects by name. ALWAYS use the numeric objectTypeId from the table below. NEVER explore the API — use the object IDs and query patterns in this skill.**

## What This HubSpot System Is

PluginBrands is an outsourced commercial team for consumer brands. Brands pay a retainer; PluginBrands pitches their products to retailers, caterers, wholesalers. The CRM tracks both sides: **winning clients** and **selling to buyers**.

## The Data Model

```
Company ←→ Contact                      (shared — no client/buyer flag)
    ├── Deal (two types)
    │     ├── Client Deal → wins a client → creates Client Service
    │     └── Buyer Deal  → sells to buyer → creates Brands + Product Pitches
    │           └── Brand (one client × one buyer, e.g. "MOJU / Farmer J")
    │                 └── Product Pitch (one SKU × one buyer)
    ├── Client Service (contract with client — 16-stage lifecycle)
    └── Client Product (product spec sheet — 67 fields, nutritional data)
```

**Key relationships:**
- **Brand** = intersection of client and buyer. Named `CLIENT / BUYER [Deal ID]`. Has `client_name_sync` and `buyer_name`. Rollup fields aggregate from Product Pitches.
- **Product Pitch** = one SKU proposed to one buyer. Lightweight junction record (37 properties). Product specs live on Client Product, buyer context on Brand/Company.
- **Client Product** = detailed spec sheet: EAN, case size, dimensions, nutritional data (per serving + per 100g), ingredients, pricing.
- **Client Service** = live contract. MRR, scope, billing. 16-stage pipeline from onboarding to off-boarding.
- **Company** has NO client/buyer flag. Distinction comes from Deal type and associations.
- **Company → Brand** association points to the **buyer** company. Client is identified via `client_name_sync`.

## Object Type IDs — Use These Exactly

| Entity | objectTypeId | API path | Records |
|--------|-------------|----------|---------|
| Client Service | `0-162` | `/crm/v3/objects/0-162` | 19 |
| Client Product | `0-410` | `/crm/v3/objects/0-410` | 157 |
| Product Pitch | `0-420` | `/crm/v3/objects/0-420` | 6,229 |
| Brand | `0-970` | `/crm/v3/objects/0-970` | 1,212 |

Standard objects use names: `contacts`, `companies`, `deals`.

These are repurposed native HubSpot types. `/crm/v3/schemas` returns empty. Name-based paths (`/crm/v3/objects/brand`) will fail. Only numeric IDs work.

## Pipelines and Stages

**Buyer Deal Pipeline** (`2760762586`): Discovery → Follow Up → Feedback Pending → Feedback Received → Proposal → Proposal Feedback Pending → Won → Lost → No Response

**Client Deal Pipeline** (`2760762585`): Discovery → Meeting Booked → Proposal → Negotiation → Contract Sent → Closed Won → Closed Lost

**Client Service Pipeline** (`ba9cdbd6-e220-45b2-a5a2-d67ebdcbade6`): 0. Waiting for Onboarding → 1. Basic Info Request → 2. Full Info Request (Client Products created here) → 3. Brand Induction → 4. In Contract → 5-8. Countdown to rolling → 9. Rolling Agreement → 10. Renewed → 11. Leaving → 12-14. Departure countdown → 15. Off-boarded

**Brand Pipeline** (`139663aa-09ee-418e-b67d-c8cfcd3e5ce3`): Brand Pitched → Waiting → Samples Requested → Proposal → Waiting for Feedback → Won → Lost

**Product Pitch Pipeline** (`fdeea9a0-8d7e-4f9b-97b6-ca9a587eee87`): Proposed → Negotiation → Product Placed → Declined → Discontinued

## How Operators Work

1. Create Buyer Deal → workflow **auto-creates Brand records** (one per client brand)
2. Operator creates Product Pitch records under each Brand (selects SKUs)
3. Communication happens **outside HubSpot** (email, phone, WhatsApp — Calls=0, Emails=blocked)
4. Meetings logged via calendar sync (1,070 records). Notes (114) and Tasks (117) barely used
5. Move Deal/Brand/Product Pitch stages as pitch progresses
6. Brand → "Won" when buyer accepts the brand; Product Pitch → "Product Placed" when SKU lands

## Field Value Standards

- **Country:** Always use the full name `"United Kingdom"`, never abbreviations like `"UK"` or `"GB"`. HubSpot stores countries as full names.
- **`buyer` on Deals:** This is a **calculated read-only field**. It auto-populates from the associated company name. Do NOT set it when creating a deal — the API will reject it.

## Known Data Quality Issues — Flag These

| Issue | Detail |
|-------|--------|
| **`products_placed` rollup = 0 everywhere** | Broken. Even Won Brands show 0. Query Product Pitch records at 'Product Placed' stage directly instead. |
| **`amount` fields = null everywhere** | Null across all Product Pitch and Brand records. Financial data is not tracked. State this explicitly. |
| **Duplicate Brand records** | Workflow bug creates duplicates every 80-104 min. MOJU/Farmer J has 31+ copies. |
| **Missing meeting associations** | 11/14 MOJU deals have 0 meetings despite activity happening. Meetings logged to Contact/Company, not Deal. |
| **Legacy pipelines** | 12 client-named deal pipelines (e.g., `[D] Moju`) exist from v1 model. **Superseded — prefer Brand + Product Pitch.** |

## Red Flags — Stop If You Think These

| Thought | Reality |
|---------|---------|
| "Let me try `/crm/v3/objects/brand`" | Will fail. Use `/crm/v3/objects/0-970`. |
| "I'll check `/crm/v3/schemas` to find object IDs" | Returns empty. Use the table above. |
| "The token doesn't have permission" | It does. Use the numeric objectTypeId, not the name. |
| "Let me explore the API to discover what's available" | Don't explore. Use the exact paths in this skill. |
| "I'll use the legacy `[D] Moju` pipeline instead" | Superseded. Use Brand (`0-970`) and Product Pitch (`0-420`). |
| "The `products_placed` rollup will have the count" | Broken — always 0. Query Product Pitches directly. |
| "The `amount` field will have financial data" | Null everywhere. State the data isn't available. |

## Common Query Recipes

**"Who buys from [client]?"** → Search Brand `0-970` where `client_name_sync` = client, filter by stage = Won, read `buyer_name` or follow Company association.

**"How many products placed?"** → Search Product Pitch `0-420` where `client_name_sync` = client, filter by stage = 'Product Placed'. Do NOT use the `products_placed` rollup.

**"Pipeline report for [client]?"** → Search Brand `0-970` where `client_name_sync` = client, group by `hs_pipeline_stage`.

**"Nutritional data for products?"** → Query Client Product `0-410`. Fields: `per_1__energy_kjkcal`, `per_1__fat`, `per_1__carbohydrate`, `per_1__protein`, `per_1__salt`, `per_2__*` variants, `ingredients_english`, `serving_size`.

**"Activity for [client]?"** → Find Client Service `0-162` → get associated Deals → for each Deal get associated Meetings. Flag that meeting associations are incomplete.

**"Contacts at won buyers?"** → Deals in Buyer Deal Pipeline at Won stage → associated Companies → associated Contacts.

## Query Checklist

1. **Identify the right entity** from the data model above.
2. **Use the correct API path** — numeric objectTypeId for custom objects, names for standard.
3. **Request specific properties** — `?properties=field1,field2` or `properties` array in search POST.
4. **Use search for filtering** — `POST /crm/v3/objects/{id}/search` with `filterGroups`.
5. **Follow associations for multi-hop** — `GET /crm/v3/objects/{type}/{id}/associations/{toType}`.
6. **Flag data quality issues** — null/0 values must be called out, never silently omitted.

