---
name: hubspot-api-query
description: MUST USE for ANY HubSpot query, API call, data retrieval, report building, entity lookup, or question about the PluginBrands CRM. Activate this skill BEFORE making any curl call to HubSpot. If the task involves HubSpot data in any way, use this skill.
---

# HubSpot API Query — PluginBrands

## Iron Laws

1. **NEVER query custom objects by name. ALWAYS use the numeric objectTypeId from the table below. NEVER explore the API — use the object IDs and query patterns in this skill.**

2. **When creating a Buyer Deal, you MUST associate at least one Client Service (`0-162`).** This triggers a HubSpot workflow that auto-creates Brand records (one per Client Service selected). Without it, no Brands are created and the deal is incomplete. If the user doesn't specify which Client Service(s), query available ones and present the list before creating the deal.

## What This HubSpot System Is

PluginBrands is an outsourced commercial team for consumer brands. Brands pay a retainer; PluginBrands pitches their products to retailers, caterers, wholesalers. The CRM tracks both sides: **winning clients** and **selling to buyers**.

## The Data Model

```
Company ←→ Contact                      (shared — no client/buyer flag)
    ├── Deal (two types)
    │     ├── Client Deal → wins a client → creates Client Service
    │     └── Buyer Deal  → sells to buyer → creates Brands (at Discovery) + Product Pitches (at Feedback Received)
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

## Automation Chain — What Happens Automatically

**Brand creation** (workflow `3523907825`, `shouldReEnroll: true`):
- Trigger: Deal enters Discovery stage (`4443390193`)
- Action: Creates one Brand (`0-970`) per associated Client Service, at "Brand Pitched" stage. Then **removes** the Client Service association from the Deal.
- Timing: ~6 seconds after deal creation.

**Deal → Brand stage cascade** (workflow `3540255935`):
- Trigger: Deal stage changes
- Mapping (only these four stages cascade):

| Deal Stage | Deal Stage ID | → Brand Stage | Brand Stage ID |
|-----------|---------------|---------------|----------------|
| Follow Up | `4443390195` | Waiting | `4447561934` |
| Feedback Pending | `4443390196` | Samples Requested | `4447561935` |
| Feedback Received | `4443390197` | **Proposal** | `4447561936` |
| Proposal | `4443390198` | Waiting for Feedback | `4447561937` |

Discovery, Won, Lost, and No Response do NOT cascade.

**Product Pitch creation** (workflow `3585155261`, `shouldReEnroll: false`):
- Trigger: Brand enters **Proposal stage only** (`4447561936`) — NOT any stage change.
- Action: Gets associated Client Service → gets all Client Products → creates one Product Pitch (`0-420`) per Client Product at "Proposed" stage.
- Fires **once per Brand** (re-enrollment disabled). Subsequent stage changes do not create more pitches.
- This means Product Pitches appear when the Deal reaches **Feedback Received**, which cascades the Brand to Proposal.

**Product Pitch naming** (workflow `3585155320`):
- Trigger: Product Pitch created/updated
- Sets `hs_name` to `PRODUCT / BUYER - CLIENT [ID]` and syncs `client_name_sync` from Brand.

**Cascading outcomes:**
- Product Pitch → Product Placed → Brand → Won → Deal → Won
- All Product Pitches → Declined/Discontinued → Brand → Lost → All Brands Lost → Deal → Lost

## How Operators Work

1. Create Buyer Deal at Discovery → workflow **auto-creates Brand records** (~6 seconds)
2. Move Deal through stages — Brand stage cascades automatically
3. When Deal reaches **Feedback Received** → Brand reaches **Proposal** → **Product Pitches auto-created** (one per Client Product)
4. Communication happens **outside HubSpot** (email, phone, WhatsApp — Calls=0, Emails=blocked)
5. Meetings logged via calendar sync (1,070 records). Notes (114) and Tasks (117) barely used
6. Move Deal/Brand/Product Pitch stages as pitch progresses
7. Product Pitch → "Product Placed" when SKU lands; Brand → "Won" when buyer accepts the brand

## Field Value Standards

- **Country:** Always use the full name `"United Kingdom"`, never abbreviations like `"UK"` or `"GB"`. HubSpot stores countries as full names.
- **`buyer` on Deals:** This is a **calculated read-only field**. It auto-populates from the associated company name. Do NOT set it when creating a deal — the API will reject it.

## Brand Fields (`0-970`)

**Auto-populated (do not set manually):**
- `hs_name` — `CLIENT / BUYER [Deal ID]` (set by workflow)
- `client_name_sync` — synced from Client Service name (read-only calculated)
- `buyer_name` — from deal name (read-only calculated, sometimes empty — workflow bug)
- `hs_pipeline` / `hs_pipeline_stage` — set by workflow, cascaded from Deal stage
- `hs_close_date` — auto-set when stage moves to Won/Lost
- `total_number_of_products` — rollup from associated Product Pitches (read-only calculated)
- `count_of_closed_products` — rollup (read-only calculated)
- `products_placed` — rollup (read-only calculated, **broken — always 0**)
- `amount` — rollup (read-only calculated, **null everywhere**)
- `closed_matching` — calculated (read-only)

**Operator fields (available for manual entry — currently unfilled across all records):**
- `hubspot_owner_id` — who owns this buyer relationship
- `hs_status` — API values: `on_track` / `delayed` / `blocked` / `completed` / `on_hold` / `at_risk`
- `hs_priority` — API values: `low` / `medium` / `high`
- `hs_type` — Service / Service - Onboarding / Marketing / Sales / Internal Ops
- `hs_description` — notes on the pitch campaign
- `hs_start_date` — when pitch work began
- `hs_target_due_date` — target close date
- `hs_total_cost` — monetary value of the pitch/win
- `hs_amount_paid` / `hs_amount_remaining` — payment tracking

**Inherited from native Project type (not relevant):**
`hs_internal_onboarding_goal`, `hs_onboarding_customer_goal`, `hs_onboarding_risks_and_blockers`, `hs_onboarding_success_metrics` — ignore these.

## Product Pitch Fields (`0-420`)

**Auto-populated (do not set manually):**
- `hs_name` — `PRODUCT / BUYER - CLIENT [ID]` (set by naming workflow)
- `client_name_sync` — synced from Brand (set by naming workflow)
- `hs_pipeline` / `hs_pipeline_stage` — created at Proposed stage by workflow
- `is_closed` — calculated

**Operator fields (available for manual entry — currently unfilled across nearly all records):**
- `hubspot_owner_id` — who is working this pitch
- `amount` — value of this placement (only 1 of 11 Placed pitches has a value)
- `hs_price` — price
- `misc_notes` — notes about the pitch/negotiation
- `reason` — why the pitch was declined or placed (important for pattern recognition)

**Inherited from native Listing type (not relevant — these are real estate fields):**
`hs_address_1/2`, `hs_city`, `hs_state_province`, `hs_zip`, `hs_bedrooms`, `hs_bathrooms`, `hs_square_footage`, `hs_lot_size`, `hs_year_built`, `hs_neighborhood` — ignore these. `hs_listing_type` is relabelled "Product Pitch Type" but its options are still housing types (House, Townhouse, etc.) — ignore.

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
| "I'll create the deal without a Client Service" | Deal will have no Brands. Always associate at least one Client Service (`0-162`) using association type `795`. |
| "Product Pitches are created when the Brand is created" | No. They're created when the Brand reaches **Proposal** stage (`4447561936`), which happens when the Deal reaches Feedback Received. |
| "I'll set `hs_status` or `hs_priority` on the Brand" | These fields exist but are **never filled** by the team. Don't assume they have values — they'll be null. When setting them via API, use **lowercase** values (e.g. `on_track`, not `On Track`). |
| "I'll use the real estate fields on Product Pitch" | `hs_bedrooms`, `hs_address_1`, etc. are inherited junk from the native Listing type. Ignore them. |

## Buyer Deal Creation Recipe

1. **Look up available Client Services** — `GET /crm/v3/objects/0-162?limit=100&properties=hs_name` returns all client brands (e.g. MOJU, Love Corn, GLUG!). The `hs_name` field is the display name; the record `id` is what you associate.
2. **If the user hasn't specified Client Service(s), present the list and ask.** Do NOT create the deal without at least one.
3. **Create the deal with Client Service association(s) in a single call:**
   ```json
   {
     "properties": { "dealname": "...", "pipeline": "2760762586", "dealstage": "4443390193", ... },
     "associations": [
       { "to": {"id": "COMPANY_ID"}, "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 5}] },
       { "to": {"id": "CLIENT_SERVICE_ID"}, "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 795}] }
     ]
   }
   ```
4. **A HubSpot workflow fires within seconds** — it creates a Brand record (`0-970`) for each Client Service associated, then **removes** the Client Service association from the deal. The Brand gets `buyer_name` (from dealname) and `client_name_sync` (from the Client Service name) auto-populated.
5. **To verify**, check the deal's Brand associations: `GET /crm/v3/objects/deals/{id}/associations/0-970`. Do NOT check Client Service associations — they will be empty (consumed by the workflow).

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

