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
| **Company** | Any organisation — a client brand or a buyer | 2,283 | "Sodexo", "MOJU Ltd" |
| **Contact** | A person at a company | 6,273 | "Jane Smith, Category Manager at Sodexo" |
| **Deal** | A sales opportunity (client acquisition or buyer development) | 1,488 | "Farmer J" (buyer deal), "MOJU" (client deal) |
| **Client Service** | The live contract with a client brand | 20 | "MOJU" — MRR, scope, contract terms |
| **Client Product** | A product SKU with full specifications | 157 | "Moju Ginger Shot 60ml" — EAN, case size, nutritional data |
| **Brand** | One client's brand being pitched to one buyer | 1,264 | "MOJU / Farmer J [494017450175]" |
| **Product Pitch** | One SKU being proposed to one buyer | 6,276 | "Moju Ginger Shot at Farmer J → Proposed" |

### How the entities connect

Companies and Contacts are shared across both sides. There is no field on either that says "this is a client" vs "this is a buyer" — the distinction is carried by associations and the Deal `type` field ("Plugin Brand Client" or "Potential Buyer").

The Deal entity serves double duty. Two pipelines, two property groups, zero overlap between them:

| | Client Deal | Buyer Deal |
|---|---|---|
| **Pipeline** | Client Deal Pipeline (7 stages) | Buyer Deal Pipeline (9 stages) |
| **Property group** | `client_information` — scope of work, commission, contract file, billing frequency, notice period | `buyer_information` — number of sites, route to market, sample address, brands listed |
| **Purpose** | Win a new client brand | Develop a buyer relationship |
| **Result** | Creates a Client Service | Creates Brands (at Discovery) and Product Pitches (when Brand reaches Proposal) |

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
3. A workflow automatically creates Brand records linking the deal to the operator's client brands — named `CLIENT / BUYER [Deal ID]` (~6 seconds)
4. They contact the buyer (via email, phone, WhatsApp — outside HubSpot)
5. They log meetings through HubSpot's calendar integration
6. They move Deal stages as the pitch progresses — Brand stages cascade automatically
7. When Deal reaches **Feedback Received**, Brand cascades to **Proposal**, and a workflow **auto-creates Product Pitch records** (one per Client Product). This fires once per Brand.
8. They move Product Pitch stages as individual SKU outcomes become clear
9. If a product is accepted → Product Pitch moves to "Product Placed"
10. If the overall brand is accepted → Brand moves to "Won"

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

See the full [Automations](#automations--workflows) section below. Summary:

- **Brand record creation** — workflow creates Brand records when a Buyer Deal enters Discovery (one per associated Client Service). `shouldReEnroll: true` — fires again if deal re-enters Discovery.
- **Product Pitch creation** — workflow creates Product Pitches when a Brand enters **Proposal stage only** (`4447561936`), not on any stage change. One Product Pitch per Client Product under the Client Service. `shouldReEnroll: false` — fires **once per Brand**.
- **Product Pitch naming** — auto-set to `PRODUCT / BUYER - CLIENT [ID]` from fetched Brand and Client Product data
- **Deal ↔ Brand stage sync** — Deal stage changes cascade to associated Brand stages via a mapping table
- **Cascading loss** — all Product Pitches lost → Brand lost → all Brands lost → Deal lost
- **Cascading win** — Product Pitch placed → Brand won → Deal won
- **Client Service countdown stages** — date-driven automation (6/3/2/1 months till rolling, 3/2/1 months from leave, off-boarding countdown)
- **Client Service creation** — auto-created when a Client Deal closes won
- **MRR/TCV calculation** — `mrr` synced from `contract_value`; TCV calculated as MRR × months since start
- **Deal auto-close** — deals stale for 60 days at Feedback Pending auto-close as No Response
- **Lead recycling** — won deals create "Upsell" leads after 90 days; no-response deals create "Reattempting" leads after 60 days; lost deals reattempt after 180 days
- **Lead → Deal conversion** — qualified Client Leads auto-create Deals in the Client Deal Pipeline
- **Lead disqualification recycling** — disqualified Leads with `recycle = YES` re-enter pipeline after 6 months
- **Company ↔ Lead sync** — employee count and industry sync from Lead to associated Company
- **`client_name_sync`** — synced text field across Brand and Product Pitch records
- **Meeting creation** — calendar integration syncs meetings into HubSpot

### What's manual

- Deal creation — operators create buyer deals when they identify a target
- Product spec data entry — 67 fields per Client Product
- Deal stage movement — dragging cards on the kanban board (Brand stages cascade automatically; Product Pitch stages are moved manually)
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

## Automations & Workflows

There are **30 active flows** in the portal (29 enabled, 1 disabled). Several use custom Python/Node.js code actions via HubSpot Operations Hub. Accessed via `GET /automation/v4/flows` and `GET /automation/v3/workflows`.

### The automation chain

This is how the workflows connect end-to-end:

```
Lead qualified
  └→ Creates Deal (Client or Buyer)

Client Deal Closed Won
  └→ Creates Client Service (0-162)
       └→ Time-based stage movers run (rolling/leaving countdowns)
       └→ MRR and TCV are auto-calculated

Buyer Deal enters Discovery (with Client Service associated)
  └→ Creates Brand(s) — one per Client Service (~6 seconds)
       └→ Removes Client Service ↔ Deal link
  └→ Deal stage changes cascade to Brand stages via mapping

Brand enters Proposal stage (triggered by Deal reaching Feedback Received)
  └→ Creates Product Pitches — one per Client Product (fires ONCE per Brand, shouldReEnroll: false)
       └→ Associates each Product Pitch to Brand + Client Product
       └→ Product Pitch name auto-set: "PRODUCT / BUYER - CLIENT [ID]"

Product Pitch → Declined/Discontinued (all of them)
  └→ Brand → Lost

Brand → Lost (all of them)
  └→ Deal → Closed Lost

Product Pitch → Product Placed
  └→ Brand → Won
       └→ Deal → Won

Deal → Won
  └→ After 90 days → Creates "Upsell" Lead

Deal → No Response
  └→ After 60 days → Creates "Reattempting" Lead

Deal → Lost
  └→ After 180 days → Creates "Reattempting" Lead

Deal stale 60 days at Feedback Pending
  └→ Auto-closes as No Response (email notification sent)
```

### Lead flows (5 flows, object type `0-136`)

| Flow | ID | Status | Trigger | Action |
|------|-----|--------|---------|--------|
| **Client Lead → Qualified** | `3058177272` | ON | Lead enters "Qualified" stage in Client Lead Pipeline | Creates a Deal in Client Deal Pipeline at Discovery, copies owner |
| **Client Lead → Disqualified** | `3058342079` | ON | Lead enters "Disqualified" stage | If `recycle = YES (IN 6 MONTHS)`: waits 180 days, re-stages Lead |
| **Buyer Lead → Disqualified (clone)** | `3058175219` | ON | Lead enters "Disqualified" in Buyer Pipeline | Same recycle logic — wait 6 months, re-stage |
| **Buyer Lead → Disqualified** | `3058429169` | ON | Lead enters "Disqualified" in Buyer Pipeline | Same recycle pattern |
| **Employees/Industry Sync** | `3058429142` | ON | Lead property change | Syncs `employees` → Company `numberofemployees`, Lead `sector` → Company `industry` |

### Deal flows (12 flows, object type `0-3`)

| Flow | ID | Status | Trigger | Action |
|------|-----|--------|---------|--------|
| **Client Deal → Closed Won** | `3091609813` | ON | Client Deal enters "Closed Won" | (Triggers downstream; no visible inline actions) |
| **Client Deal → Closed Lost** | `3091637468` | ON | Client Deal enters "Closed Lost" | If `recycle = YES (IN 6 MONTHS)`: waits 180 days, re-stages |
| **Create Service on Client Deal Close** | `3150549212` | ON | Client Deal closes | Creates a Client Service (`0-162`) with `hs_name = dealname`, in Service Pipeline |
| **Create Brands from Deal in Discovery** | `3523907825` | ON | Deal enters stage `4443390193` (Discovery). Re-enrollment enabled | **Python script (2 actions):** Action 1: gets Deal name + associated Client Services → for each, creates a Brand (`0-970`) named `SERVICE / DEAL [DEAL_ID]` at "Brand Pitched" stage, associates Brand → Deal and Brand → Service. Action 2: removes all Client Service associations from the Deal |
| **Map Deal Stage to Brand Stage** | `3540255935` | ON | Deal stage changes | **Python script.** Mapping: Deal Follow Up (`4443390195`) → Brand Waiting (`4447561934`), Deal Feedback Pending (`4443390196`) → Brand Samples Requested (`4447561935`), Deal Feedback Received (`4443390197`) → Brand Proposal (`4447561936`), Deal Proposal (`4443390198`) → Brand Waiting for Feedback (`4447561937`). Updates ALL associated Brands |
| **When Brand is Won → Set Deal to Won** | `3615473888` | ON | (Triggered by Brand flow) | Sets deal stage to Won (`4443390199`) |
| **Buyer Deal → Follow Up timer** | `3621268704` | ON | Deal enters "Follow Up" | Waits 24 hours, moves Deal to "Feedback Pending" (`4443390195`) |
| **Buyer Deal → Feedback Received** | `3621270756` | ON | Deal enters "Feedback Received" | (No inline actions — placeholder) |
| **Auto-close after 60 days** | `3621270759` | ON | Deal enrolled (enrollment criteria) | Waits 60 days. If still at "Feedback Pending": emails owner `"[Deal] has been automatically closed"`, moves to "No Response" (`4443390200`) |
| **Upsell 90 days after Win** | `3856414964` | ON | Deal enters Won (`4443390199`) | Waits 90 days. **Python script:** gets associated Company + Contacts, creates a Lead titled `"Upsell - [COMPANY]"` with Primary Company/Contact associations |
| **Reattempt 60 days after No Response** | `3856741608` | ON | Deal enters No Response (`4443390200`) | Waits 60 days. Creates Lead titled `"Reattempting - [COMPANY]"` |
| **Reattempt 180 days after Lost** | `3856741624` | ON | Deal enters Lost | Waits 180 days. Creates Lead titled `"Reattempting - [COMPANY]"` |

### Brand flows (4 flows, object type `0-970`)

| Flow | ID | Status | Trigger | Action |
|------|-----|--------|---------|--------|
| **Create Product Pitch on Brand Movement** | `3585155261` | ON | Brand enters **Proposal stage only** (`4447561936`). `shouldReEnroll: false` — fires once per Brand. | **Python script:** gets associated Client Service → gets all Client Products for that service → for each, creates a Product Pitch (`0-420`) named `PRODUCT - SERVICE` at "Proposed" stage in Product Pitch Pipeline, associates Pitch → Brand and Pitch → Client Product |
| **When Product is Placed → Set Brand to Won** | `3615473872` | ON | (Triggered by Product Pitch placement) | Sets Brand stage to Won (`4447561938`) |
| **When All Brands Lost → Close Buyer Deal** | `3621266653` | ON | Brand enters Lost (`4447561939`) | **Python script:** gets associated Deal, fetches ALL Brands for that Deal, checks if every Brand is at "Lost". If yes: moves Deal to closed stage (`3774636266`) |
| **Unnamed workflow** | `3585155280` | OFF | — | Empty/disabled |

### Product Pitch flows (2 flows, object type `0-420`)

| Flow | ID | Status | Trigger | Action |
|------|-----|--------|---------|--------|
| **Update Naming of Product Pitches** | `3585155320` | ON | Product Pitch created/updated | Sets `client_name_sync` from associated Brand's `client_name_sync`. Sets `hs_name` to `PRODUCT_NAME / BUYER_NAME - CLIENT_NAME [ID]` using fetched data from Brand (`fetched_object_1227905237`) and Client Product (`fetched_object_1227905238`) |
| **If ALL Products Lost → Update Brand** | `3621264628` | ON | Product Pitch enters Declined (`4549842109`) or Discontinued (`4549842110`) | **Python script:** gets associated Brand, fetches ALL Product Pitches for that Brand, checks if every one is Declined or Discontinued. If yes: moves Brand to "Lost" (`4447561939`) |

### Client Service flows (7 flows, object type `0-162`)

| Flow | ID | Status | Trigger | Action |
|------|-----|--------|---------|--------|
| **Move Renewed to In Contract** | `3103017163` | ON | Client Service enters "Renewed" | Sets stage to "In Contract" (`3843969243`) |
| **Off Boarding Pipeline Mover** | `3103017203` | ON | Client Service enters "Leaving" | Date countdown using `agreed_leave_date`: at -90 days → "3 Months from Leave", -60 → "2 Months", -30 → "1 Month", at date → "Off-boarded" |
| **Time Till Rolling Mover** | `3106901212` | ON | Client Service in contract | Date countdown using `hs_close_date`: at -180 days → "6 Months till Rolling", -90 → "3 Months", -60 → "2 Months", -30 → "1 Month", at date → "Rolling Agreement" |
| **Time Till Leaving** | `3485716716` | ON | Client Service approaching leave | Date countdown using `agreed_leave_date`: at -90 → "3 Months from Leave", -60 → "2 Months", -30 → "1 Month", at date → "Off-boarded" |
| **Notify Client Owner and Charlie** | `3493031136` | OFF | Client Service stage changes | Sends internal email: `"[NAME] has moved to a new stage: [STAGE]"` to Charlie Knight (user 25745855) + record owner. Currently disabled |
| **Store Sold MRR** | `3909881063` | ON | Client Service updated | Copies `contract_value` (calculated from Deal) into `mrr` field |
| **Calculate TCV** | `3911079121` | ON | `mrr` or `hs_start_date` changes | **Node.js custom code:** calculates `Total Customer Value = MRR × months elapsed since start date`. Stores result in `total_customer_value` |

### Custom-coded actions summary

8 of the 30 flows contain custom Python or Node.js code running on HubSpot Operations Hub:

| Flow | Runtime | What the code does |
|------|---------|-------------------|
| Create Brands from Deal in Discovery | Python 3.9 | Creates Brand records, associates to Deal + Service, then removes Service ↔ Deal links |
| Map Deal Stage to Brand Stage | Python 3.9 | Reads deal stage, looks up mapping, updates all associated Brand stages |
| Create Product Pitch on Brand Movement | Python 3.9 | Creates Product Pitch records from Client Products, associates to Brand + Client Product. Triggers on Brand entering Proposal stage only (`shouldReEnroll: false` — once per Brand). |
| If ALL Products Lost → Update Brand | Python 3.9 | Checks every sibling Product Pitch stage; if all Declined/Discontinued, sets Brand to Lost |
| When All Brands Lost → Close Deal | Python 3.9 | Checks every sibling Brand stage; if all Lost, closes the Deal |
| Upsell 90 days after Win | Python 3.9 | Creates Lead with company/contact associations |
| Reattempt 60 days after No Response | Python 3.9 | Creates Lead with company/contact associations |
| Reattempt 180 days after Lost | Python 3.9 | Creates Lead with company/contact associations |
| Calculate TCV | Node 20.x | Calculates MRR × months since start |

All Python scripts use a `HUBSPOT_TOKEN` secret stored in the workflow secrets, and call the HubSpot REST API directly via `requests`.

### Deal stage ↔ Brand stage mapping

This mapping is hardcoded in the "Map Deal Stage to Brand Stage" workflow:

| Deal Stage | Deal Stage ID | Brand Stage | Brand Stage ID |
|-----------|---------------|-------------|----------------|
| Follow Up | `4443390195` | Waiting | `4447561934` |
| Feedback Pending | `4443390196` | Samples Requested | `4447561935` |
| Feedback Received | `4443390197` | Proposal | `4447561936` |
| Proposal | `4443390198` | Waiting for Feedback | `4447561937` |

Stages not in this mapping (Discovery, Won, Lost, No Response) do not cascade to Brands.

### Known automation issues

| Issue | Detail |
|-------|--------|
| **Duplicate Brand creation** | The "Create Brands from Deal in Discovery" workflow has `shouldReEnroll: true` and re-enrollment triggers on `dealstage` change. If a deal re-enters Discovery or the stage property is touched, it creates a full new set of Brands without checking for duplicates. This explains the 80-104 minute duplicate cycle observed for MOJU. |
| **Product Pitch inflation via duplicate Brands** | "Create Product Pitch on Brand Movement" actually triggers only when a Brand enters Proposal stage (`4447561936`), and `shouldReEnroll: false` means it fires once per Brand. However, Brands with `total_number_of_products: 221` (for services with few Client Products) are explained by duplicate Brand records — each duplicate Brand fires the workflow independently when it reaches Proposal. The Brand duplication workflow (above) is the root cause. |
| **Off-boarding has two overlapping workflows** | Both "Off Boarding Pipeline Mover" (`3103017203`) and "Time Till Leaving" (`3485716716`) use `agreed_leave_date` for countdowns with similar stage progressions. They may conflict or double-trigger stage changes. |
| **Notification workflow disabled** | "Notify Client Owner and Charlie" is OFF. Stage changes to Client Services are not being communicated to stakeholders. |

---

## Known data quality issues

### Duplicate Brand records

The "Create Brands from Deal in Discovery" workflow (flow `3523907825`) has `shouldReEnroll: true` with re-enrollment triggered by `dealstage` property changes. When a deal's stage is touched — even if it stays at Discovery — the workflow fires again and creates a new full set of Brand records without checking for duplicates. For MOJU alone: Farmer J has 31+ identical records. The root cause is confirmed: the workflow lacks a guard condition ("only create if a Brand doesn't already exist for this client + buyer + deal"). Each duplicate Brand then independently triggers the Product Pitch creation workflow when it reaches Proposal stage, multiplying Product Pitch records.

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

---

## Brand and Product Pitch field usage

Both Brand (`0-970`) and Product Pitch (`0-420`) are repurposed native HubSpot types (Project and Listing respectively). They inherit fields from those native types that are not relevant to PluginBrands. As of March 2026, the team fills in almost none of the optional fields on either object.

### Brand fields

**Auto-populated by workflows:**
`hs_name`, `client_name_sync`, `buyer_name`, `hs_pipeline`, `hs_pipeline_stage`, `hs_close_date`, `total_number_of_products`, `count_of_closed_products`, `products_placed` (broken), `amount` (null), `closed_matching`.

**Available but not used by the team (empty across all sampled Won, Lost, and open records):**
`hubspot_owner_id`, `hs_status` (On Track/Delayed/Blocked/Completed/On-Hold/At-Risk), `hs_priority` (Low/Medium/High), `hs_type` (Service/Marketing/Sales/Internal Ops), `hs_description`, `hs_start_date`, `hs_target_due_date`, `hs_total_cost`, `hs_amount_paid`, `hs_amount_remaining`.

**Inherited from native Project type (irrelevant):**
`hs_internal_onboarding_goal`, `hs_onboarding_customer_goal`, `hs_onboarding_risks_and_blockers`, `hs_onboarding_success_metrics`.

### Product Pitch fields

**Auto-populated by workflows:**
`hs_name`, `client_name_sync`, `hs_pipeline`, `hs_pipeline_stage`, `is_closed`.

**Available but not used by the team (empty across all sampled Placed, Declined, and open records):**
`hubspot_owner_id`, `amount` (only 1 of 11 Placed pitches has a value), `hs_price`, `misc_notes`, `reason`.

**Inherited from native Listing type (irrelevant — real estate fields):**
`hs_address_1/2`, `hs_city`, `hs_state_province`, `hs_zip`, `hs_bedrooms`, `hs_bathrooms`, `hs_square_footage`, `hs_lot_size`, `hs_year_built`, `hs_neighborhood`. `hs_listing_type` is relabelled "Product Pitch Type" but its dropdown options are still housing types (House, Townhouse, Multi-Family, etc.).

---

## API connection

### Authentication

This project connects to the PluginBrands HubSpot portal via the HubSpot REST API using a **HubSpot Service Key**. Despite the `pat-` prefix, this is a service key (not a Private App token).

- **Portal ID:** `24916652`
- **Datacenter:** EU (`eu1`)
- **Token format:** `pat-eu1-...` (Service Key)
- **Auth method:** Bearer token in the `Authorization` header
- **API base URL:** `https://api.hubapi.com`

Example API request:

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

**Token management:**
- **Location:** HubSpot UI > Settings > Account Management > Integrations
- **Current key name:** "Ollie - Test"
- **Scopes:** Read and write access across CRM objects

Key scopes include:

| Category | Scopes |
|----------|--------|
| Contacts | `crm.objects.contacts.read`, `crm.objects.contacts.sensitive.read`, `crm.objects.contacts.highly_sensitive.read` |
| Companies | `crm.objects.companies.read`, `crm.objects.companies.sensitive.read`, `crm.objects.companies.highly_sensitive.read` |
| Deals | `crm.objects.deals.read`, `crm.objects.deals.sensitive.read`, `crm.objects.deals.highly_sensitive.read` |
| Custom objects | `crm.objects.custom.read`, `crm.objects.custom.sensitive.read`, `crm.objects.custom.highly_sensitive.read` |
| Schemas | `crm.schemas.contacts.read`, `crm.schemas.companies.read`, `crm.schemas.deals.read`, `crm.schemas.custom.read`, etc. |
| Other objects | Products, quotes, invoices, line items, orders, services, appointments, forecasts, goals, leads, listings, courses, etc. |

### Common endpoints

| Endpoint | Description |
|----------|-------------|
| `/crm/v3/objects/{objectType}` | List/search standard objects (contacts, companies, deals, products) |
| `/crm/v3/objects/{objectTypeId}` | List records for custom objects by numeric ID (e.g., `0-970`) |
| `/crm/v3/objects/{objectType}/{recordId}` | Get a single record by ID |
| `/crm/v3/objects/{objectType}/search` | Search with filters (POST) |
| `/crm/v3/properties/{objectType}` | List all properties for an object type |
| `/crm/v3/pipelines/{objectType}` | List pipelines and stages for an object type |
| `/crm/v3/owners` | List CRM owners/users |
| `/automation/v4/flows` | List all workflow flows |
| `/automation/v4/flows/{flowId}` | Get full flow detail including custom code source |
| `/automation/v3/workflows` | List workflows in v3 format (legacy) |

### Querying custom objects

Since the four custom entities (Brand, Product Pitch, Client Product, Client Service) are repurposed native HubSpot types, you must use numeric `objectTypeId` values. See the [Object type IDs](#object-type-ids) table above for reference.

Example queries:

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

Each pipeline has a unique ID required for certain API operations:

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

### Workflow/Automation API

The portal has 30 flows (29 enabled, 1 disabled) accessible via the v4 API. Several contain custom Python 3.9 / Node 20.x code actions.

```bash
# List all flows
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/automation/v4/flows"

# Get full flow detail (including source code of custom actions)
curl -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/automation/v4/flows/{flowId}"
```

Key response fields:
- `actions[]` — the action nodes (not `nodes` — that's the v3 format)
- `actions[].sourceCode` — Python/Node.js source for custom-coded actions
- `actions[].secretNames` — secrets used (e.g., `HUBSPOT_TOKEN`)
- `actions[].runtime` — `PYTHON39` or `NODE20X`
- `enrollmentCriteria` — trigger conditions
- `dataSources` — fetched associated objects available to the flow

### Verified endpoints (2026-03-20)

All tested with the "Ollie - Test" service key:

| Endpoint | Status |
|----------|--------|
| `GET /crm/v3/objects/{type}` | Works (all standard + custom objects) |
| `POST /crm/v3/objects/{type}/search` | Works |
| `GET /crm/v3/properties/{type}` | Works |
| `GET /crm/v3/pipelines/{type}` | Works |
| `GET /crm/v3/owners` | Works |
| `GET /crm/v3/schemas` | Returns empty (expected — not user-created custom objects) |
| `GET /automation/v4/flows` | Works — returns all 30 workflow flows |
| `GET /automation/v4/flows/{flowId}` | Works — returns full flow detail including custom code source |
| `GET /automation/v3/workflows` | Works — returns v3 workflow format (1 legacy workflow) |
