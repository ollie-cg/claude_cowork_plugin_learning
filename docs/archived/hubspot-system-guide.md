# PluginBrands HubSpot System Guide

## What PluginBrands does

PluginBrands is an outsourced commercial team for consumer brands. A brand — drinks, snacks, household products — pays PluginBrands a monthly retainer. In return, PluginBrands pitches that brand's products to retailers, contract caterers, wholesalers, and distributors, negotiates listings, and manages the commercial relationships.

The HubSpot system tracks both sides of this operation: winning clients and selling to buyers.

---

## The data model

### Entity hierarchy

```
Company ←→ Contact                         (people and organisations)
    │            │
    ├── Deal (two types: win a client / sell to a buyer)
    │     │
    │     └── Brand (one client brand × one buyer)
    │           │
    │           └── Product Pitch (one SKU × one buyer)
    │
    ├── Client Service (the contract with a client)
    │
    └── Client Product (a product in a client's catalogue)
```

### The six core entities

| Entity | What it is | Records | Example |
|--------|-----------|---------|---------|
| **Company** | Any organisation — a client brand or a buyer | 2,239 | "Sodexo", "MOJU Ltd" |
| **Contact** | A person at a company | 6,098 | "Jane Smith, Category Manager at Sodexo" |
| **Deal** | A sales opportunity (client acquisition or buyer development) | 1,477 | "Farmer J" (buyer deal), "MOJU" (client deal) |
| **Client Service** | The live contract with a client brand | 19 | "MOJU" — MRR, scope, contract terms |
| **Client Product** | A product SKU with full specifications | 157 | "Moju Ginger Shot 60ml" — EAN, case size, nutritional data |
| **Brand** | One client's brand being pitched to one buyer | 868 | "MOJU / Farmer J [494017450175]" |
| **Product Pitch** | One SKU being proposed to one buyer | 6,043 | "Moju Ginger Shot at Farmer J → Proposed" |

### How the entities connect

Companies and Contacts are shared across both sides. There is no field on either that says "this is a client" vs "this is a buyer" — the distinction is carried by associations and the Deal `type` field ("Plugin Brand Client" or "Potential Buyer").

The Deal entity serves double duty. Two pipelines, two property groups, zero overlap between them:

| | Client Deal | Buyer Deal |
|---|---|---|
| **Pipeline** | Client Deal Pipeline (7 stages) | Buyer Deal Pipeline (9 stages) |
| **Property group** | `client_information` — scope of work, commission, contract file, billing frequency, notice period | `buyer_information` — number of sites, route to market, sample address, brands listed |
| **Purpose** | Win a new client brand | Develop a buyer relationship |
| **Result** | Creates a Client Service | Creates Brands and Product Pitches |

Brand sits at the intersection of client and buyer. Each Brand record is named `CLIENT / BUYER [Deal ID]`. It has `client_name_sync` (pulled from the Client Service) and `buyer_name`. Rollup fields aggregate from Product Pitches below it: `products_placed`, `total_number_of_products`, `count_of_closed_products`.

Product Pitch is a lightweight junction record (37 properties). It connects a Client Product (the "what") to a Brand (the "who") with a pipeline stage (the "outcome"). The product specifications live on the Client Product; the buyer context lives on the Brand and Company.

Client Product is a detailed spec sheet (67 properties): EAN codes, case sizes, pallet quantities, physical dimensions in mm, nutritional data in two serving formats (per serving and per 100g/ml), ingredients, manufacturer details, shelf life, wholesale cost, retail price.

Contact → Client Service has four custom role-based associations: Reporting, Finance, Logistics, Administration. No other association in the system has custom roles — buyer contacts are linked to Deals without role labels.

### All associations

```
contacts → companies          (Primary, Billing Contact)
contacts → deals              (Default)
contacts → Client Service     (Reporting, Finance, Logistics, Administration, Default)
contacts → Client Product     (Default)
contacts → Product Pitch      (Default)
contacts → Brand              (Default)

companies → deals             (Deal with Primary Company)
companies → Client Service    (Default)
companies → Client Product    (Default)
companies → Product Pitch     (Default)
companies → Brand             (Project with Primary Company)

deals → Client Service        (Default)
deals → Client Product        (Default)
deals → Product Pitch         (Default)
deals → Brand                 (Deal Plan)

Client Service → Client Product    (Default)
Client Service → Product Pitch     (Default)
Client Service → Brand             (Default)

Client Product → Product Pitch     (Default)
Client Product → Brand             (Default)

Product Pitch → Brand              (Default)
```

The Company → Brand association ("Project with Primary Company") points to the **buyer** company. The client is identified via `client_name_sync` text field, synced from the Client Service.

### Pipelines

**Client Deal Pipeline** (winning clients)

| Stage | Probability |
|-------|-------------|
| Discovery | 10% |
| Meeting Booked | 20% |
| Proposal | 40% |
| Negotiation | 60% |
| Contract Sent | 80% |
| Closed Won | 100% |
| Closed Lost | 0% |

**Buyer Deal Pipeline** (selling to buyers)

| Stage | Probability |
|-------|-------------|
| Discovery | 20% |
| Follow Up | 20% |
| Feedback Pending | 20% |
| Feedback Received | 20% |
| Proposal | 20% |
| Proposal Feedback Pending | 20% |
| Won | 100% |
| Lost | 0% |
| No Response | 0% |

**Client Service Pipeline** (contract lifecycle, 16 stages)

| Stage | Purpose |
|-------|---------|
| 0. Waiting for Onboarding | Client won, awaiting kickoff |
| 1. Basic Information Request | Initial data gathering |
| 2. Full Information Request | Complete spec collection — Client Products created here |
| 3. Brand Induction | Learning the brand's positioning and strategy |
| 4. In Contract | Active service, initial term |
| 5-8. 6/3/2/1 Months till Rolling | Countdown to end of initial contract term |
| 9. Rolling Agreement | Month-to-month after initial term ends |
| 10. Renewed | Client re-signed a fixed term |
| 11. Leaving | Notice given |
| 12-14. 3/2/1 Months from Leave | Departure countdown |
| 15. Off-boarded | Client departed |

The countdown stages (5-8 and 12-14) are automated — driven by date calculations.

**Brand Pipeline** (pitch campaign status)

| Stage |
|-------|
| Brand Pitched |
| Waiting |
| Samples Requested |
| Proposal |
| Waiting for Feedback |
| Won |
| Lost |

**Product Pitch Pipeline** (individual SKU outcome)

| Stage |
|-------|
| Proposed |
| Negotiation |
| Product Placed |
| Declined |
| Discontinued |

**Client Product Pipeline** (minimal)

| Stage |
|-------|
| Open Stage |
| Closed Stage |

### Legacy: client-specific deal pipelines

Before the Brand and Product Pitch objects existed, buyer outreach was tracked as Deals in client-named pipelines. 12 of these exist (Muller, Pickem, smol, MOMO Kombucha, PlugIn Clients, plus 8 deprecated with `[D]` prefix). They all share the same stage structure: Follow Up Later → Target List → Contacted → Samples Sent → Presentation → Negotiation → Closed Won/Lost. This was the v1 model, now largely superseded by Brand + Product Pitch.

---

## How operators use HubSpot

### The main views

**Deal Board (kanban)** — the primary operational view. Columns for each pipeline stage, cards for each buyer deal. Operators drag cards between columns as deals progress. Probably filtered by pipeline (Buyer Deal Pipeline, or a client-specific pipeline for legacy deals).

**Deal Record page** — clicking into a deal shows buyer details, associated Brands and Product Pitches, contact info, meeting history, and notes.

**Brand Record page** — the pitch status for one client at one buyer. Rollup fields summarise: X products pitched, Y placed, Z closed.

**Contact Record page** — buyer or client contact details, associated companies, deals, activity timeline.

**Client Service Record page** — contract overview. MRR, scope, pipeline stage. Reviewed less often — more of an admin/management view.

### The daily workflow

**Most time is spent working buyer deals.** An operator:

1. Identifies a target buyer
2. Creates a Deal in the Buyer Deal Pipeline, fills in buyer qualification fields (sites, route to market, customer profile)
3. A workflow automatically creates Brand records linking the deal to the operator's client brands — named `CLIENT / BUYER [Deal ID]`
4. The operator creates Product Pitch records under each Brand, selecting which SKUs to propose
5. They contact the buyer (via email, phone, WhatsApp — outside HubSpot)
6. They log meetings through HubSpot's calendar integration
7. They move Deal, Brand, and Product Pitch stages as the pitch progresses
8. If a product is accepted → Product Pitch moves to "Product Placed"
9. If the overall brand is accepted → Brand moves to "Won"

**Communication happens outside HubSpot.** Calls (0 records), Communications (0 records), Email object (blocked) — operators use standard email, phone, and WhatsApp. HubSpot is the pipeline tracker and contact database, not the communication platform.

**Activity logging is light.** Meetings (1,070) are the most logged activity — via calendar sync. Notes (114) and Tasks (117) are barely used. Operators come into HubSpot to move stages and check pipeline status, not to manage tasks.

### Onboarding a new client

The heaviest data entry happens when a client signs up:

1. Create a Client Service record with contract terms (MRR, billing, scope, notice period)
2. Move through onboarding stages: Basic Info Request → Full Info Request
3. Import/create Client Product records — 67 fields per product (EANs, dimensions, nutritionals, pricing). Products likely come from client spreadsheets (the `import_client_name` field suggests bulk import)
4. Brand Induction — learn the brand
5. Move to "In Contract" — active work begins

### What's automated

- **Brand record creation** — workflow creates Brand records when Deals are created (confirmed by naming pattern and a current duplicate bug creating records on 80-104 minute intervals)
- **Client Service countdown stages** — date-driven workflow automation (6/3/2/1 months till rolling, 3/2/1 months from leave)
- **`client_name_sync`** — synced text field across Brand and Product Pitch records
- **Meeting creation** — calendar integration syncs meetings into HubSpot

### What's manual

- Deal creation — operators create buyer deals when they identify a target
- Product spec data entry — 67 fields per Client Product
- Stage movement — dragging cards on the kanban board
- Notes and meeting logging
- Associating contacts to deals and meetings

---

## How to query the system

### "Who is buying from MOJU?"

```
1. Search Brand records where client_name_sync = "MOJU"
2. Filter to pipeline stage = "Won"
3. Read buyer_name field or follow Company association
```

Or at the product level:

```
1. Find Brand records for MOJU
2. Get associated Product Pitches
3. Filter to pipeline stage = "Product Placed"
```

### "How many conversations have we had about MOJU this week?"

```
1. Find MOJU Client Service (ID: 1096067395777)
2. Get associated Deals, or extract Deal IDs from Brand record names
3. For each Deal, get associated Meetings
4. Filter meetings by date
```

This requires multiple API hops. Activities are associated to Deals and Contacts, not directly to Client Service or Brand. Coverage depends on operators consistently associating meetings to the right Deals.

### "What products has MOJU got placed?"

```
1. Search Product Pitch records where client_name_sync = "MOJU"
2. Filter to pipeline stage = "Product Placed"
3. Get associated Client Product for product details
4. Get associated Brand for buyer details
```

### "What's the pipeline for a specific client?"

```
1. Search Brand records where client_name_sync = "{client}"
2. Group by pipeline stage
3. Count unique buyers per stage
```

---

## Known data quality issues

### Duplicate Brand records

A HubSpot workflow is creating duplicate Brand records on fixed intervals (80-104 minutes), running 24/7. For MOJU alone: Farmer J has 31 identical records, CBRE (Baxterstorey) has 26. All duplicates are identical — same name, same stage, 0 products. The workflow likely lacks a guard condition ("only create if a Brand doesn't already exist for this client + buyer").

### Products placed = 0 everywhere

Even Brand records at "Won" stage show `products_placed: 0`. Either Product Pitches aren't being moved to "Product Placed" stage, or the rollup isn't calculating. The Brand pipeline stage and the Product Pitch pipeline stages may not be maintained in sync.

### Missing activity associations

11 of 14 MOJU buyer deals have zero meetings associated, despite meetings clearly happening (the meeting titles reference MOJU buyers). Meetings may be logged against Contacts or Companies without being linked to the Deal, making them invisible when querying from the Deal side.

### Amount fields are empty

The `amount` field on Product Pitch is null across all MOJU records examined. Brand's `amount` (a rollup from Product Pitches) is also null. Whatever financial tracking was intended isn't being used.

---

## API access notes

### Custom object access

The four "custom" entities (Brand, Product Pitch, Client Product, Client Service) are **repurposed native HubSpot object types**, not user-created custom objects. This has two consequences:

1. `GET /crm/v3/schemas` returns empty — it only lists user-created custom objects (`2-XXXXX` IDs)
2. Name-based access (e.g., `/crm/v3/objects/brand`) does not work — you **must** use the numeric `objectTypeId`

Standard objects (Companies, Contacts, Deals) can still be queried by name.

### Object type IDs

| Object | objectTypeId | HubSpot Native Type | API path |
|--------|-------------|---------------------|----------|
| Client Service | `0-162` | Service | `/crm/v3/objects/0-162` |
| Client Product | `0-410` | Course | `/crm/v3/objects/0-410` |
| Product Pitch | `0-420` | Listing | `/crm/v3/objects/0-420` |
| Brand | `0-970` | Project | `/crm/v3/objects/0-970` |

These IDs also work with `/crm/v3/properties/{id}`, `/crm/v3/pipelines/{id}`, and `/crm/v3/objects/{id}/search`.

See [hubspot-connection.md](./hubspot-connection.md) for full endpoint reference, pipeline IDs, and example queries.

### Legacy pipelines as a fallback

Before Brand and Product Pitch objects existed, buyer outreach was tracked in client-named deal pipelines (e.g., `[D] Moju`). These contain real data but represent the v1 model. Prefer Brand and Product Pitch records — they are the authoritative source for pitch status and product placement.

---

## What the system doesn't track

| Gap | Detail |
|-----|--------|
| **Post-placement performance** | No tracking after "Product Placed" — no orders, volumes, reorders, site counts |
| **Order/fulfilment** | Orders (0), Line Items (0), Invoices (0) — all empty. Financial system is external |
| **Call/email activity** | Calls (0), Communications (0), Emails (blocked). Outreach happens outside HubSpot |
| **Volume/quantity** | No field for "how many cases" or "how many sites" on any pitch or placement |
| **Competitive intelligence** | Only `brands_listed_in_customer` (free text on Deals). No structured competitor tracking |
| **Client vs buyer distinction on Companies** | No field on Company says which side it's on. Inferred from associations only |
