# Client Service Summary — Learnings from Manual Process

> **⚠️ DEPRIORITISED (2026-04-21, v1.2.0):** The `client-summary` skill was removed from the shipped plugin. This doc is preserved for reference but is not under active development.

**Date:** 2026-03-27
**Test client:** MOJU (Client Service ID `1096067395777`)

## Purpose

Manually build a pipeline summary for a client brand, documenting every query, result, and data issue found. This serves as the reference for building a `client-summary` skill.

---

## Step 1: Fetch the Client Service

**Query:**
```
POST /crm/v3/objects/0-162/search
{
  "filterGroups": [{"filters": [{"propertyName": "hs_name", "operator": "CONTAINS_TOKEN", "value": "MOJU"}]}],
  "properties": ["hs_name", "hs_pipeline_stage", "mrr", "contract_value", "total_customer_value", "hs_start_date", "hs_close_date", "hubspot_owner_id"],
  "limit": 10
}
```

**Result:** 1 record

| Field | Value | Notes |
|-------|-------|-------|
| `id` | `1096067395777` | |
| `hs_name` | `MOJU` | |
| `hs_pipeline_stage` | `3843969253` | Need to map to label (see Step 1a) |
| `mrr` | `45000` | Stored as string. Represents £45,000/month |
| `contract_value` | `null` | Not populated |
| `total_customer_value` | `null` | Calculated field but null — may need `hs_start_date` and `mrr` to compute |
| `hs_start_date` | `2026-01-01T00:00:00Z` | |
| `hs_close_date` | `null` | No end date — rolling agreement |
| `hubspot_owner_id` | `115118133` | Adam Priest |

**Learning:** `contract_value` and `total_customer_value` are null despite `mrr` being set. The TCV calculation workflow (`3911079121`) fires when `mrr` or `hs_start_date` changes, but the result may be stored in a different field or not working. For the summary, use `mrr` directly.

### Step 1a: Map pipeline stage ID to label

The Client Service pipeline stage ID `3843969253` isn't in the skill's documented stages. Need to query the pipeline.

**Query:**
```
GET /crm/v3/pipelines/0-162
```

**Learning:** The skill documents the stage names (0. Waiting for Onboarding through 15. Off-boarded) but doesn't list the numeric stage IDs. For the summary skill, we'll need to either hardcode these or query the pipeline once.

---

## Step 2: Fetch all Brand records for the client

**Query:**
```
POST /crm/v3/objects/0-970/search
{
  "filterGroups": [{"filters": [{"propertyName": "client_name_sync", "operator": "EQ", "value": "MOJU"}]}],
  "properties": ["hs_name", "buyer_name", "client_name_sync", "hs_pipeline_stage", "total_number_of_products", "count_of_closed_products", "hs_description", "hs_lastmodifieddate", "hs_createdate"],
  "limit": 100
}
```

**Result:** 104 records total (required 2 pages — `after: "100"` for page 2)

**Key properties returned per Brand:**

| Property | Usage | Notes |
|----------|-------|-------|
| `hs_name` | Contains buyer name + deal ID in format `CLIENT / BUYER [DEAL_ID]` | Reliable way to extract deal ID |
| `buyer_name` | Buyer's name | Sometimes empty (workflow bug). Fall back to parsing `hs_name` |
| `client_name_sync` | Always `MOJU` for this query | Used as the filter |
| `hs_pipeline_stage` | Stage ID — must map to label | See stage mapping below |
| `total_number_of_products` | Count of associated Product Pitches | `0` on duplicate records (only the "real" Brand has pitches) |
| `count_of_closed_products` | Closed pitch count | Usually `0` or `null` |
| `hs_description` | Free text notes | `null` across all MOJU records |

### Brand Pipeline Stage Mapping

| Stage ID | Label |
|----------|-------|
| `4447561933` | Brand Pitched |
| `4447561934` | Waiting |
| `4447561935` | Samples Requested |
| `4447561936` | Proposal |
| `4447561937` | Waiting for Feedback |
| `4447561938` | Won |
| `4447561939` | Lost |

**These IDs are already documented in the `hubspot-api-query` skill** (in the Deal → Brand stage cascade table). They are stable.

### The Duplicate Problem

104 Brand records represent only **14 unique buyer relationships**. The known workflow bug (`shouldReEnroll: true` on Brand creation) creates duplicates.

**Deduplication logic used:**
1. Extract `deal_id` from `hs_name` using regex `\[(\d+)\]`
2. Group brands by `buyer_name + deal_id`
3. Pick the "best" record per group: the one with the highest `total_number_of_products` (duplicates have `0` products because the Product Pitch workflow only fires once per Brand, on the original)

**Duplicate counts per buyer:**

| Buyer | Total copies | Notes |
|-------|-------------|-------|
| Farmer J | 46 | Worst case — deal at Discovery, so workflow keeps re-firing |
| CBRE (Baxterstorey) | 43 | Same pattern |
| Salad Project | 3 | |
| Olive Catering | 2 | |
| All others | 1 each | |

**Learning:** Deduplication is essential. The `total_number_of_products > 0` heuristic works well — duplicate Brands have 0 products because the Product Pitch creation workflow (`shouldReEnroll: false`) only fires on the first Brand to reach Proposal stage. However, Brands still at early stages (Brand Pitched, Waiting) may legitimately have 0 products — they haven't reached Proposal yet. For these, pick the earliest-created record.

**Improved deduplication rule:** Group by `deal_id` extracted from `hs_name`. Per group, pick the record with `max(total_number_of_products)`. If all are 0, pick `min(hs_createdate)` (the original).

---

## Step 3: Extract Deal IDs and Fetch Deal Details

Brand names follow the format `CLIENT / BUYER [DEAL_ID]`. Extracting deal IDs gives us the underlying deals.

**14 unique deal IDs found:**
```
488031909084, 493050057960, 494016518370, 494017428715, 494017450175,
494057891020, 494058225876, 494058807500, 494058920178, 494059310280,
494059635961, 494190615785, 494191844569, 494413252831
```

**Query (per deal):**
```
GET /crm/v3/objects/deals/{dealId}?properties=dealname,dealstage,pipeline,hubspot_owner_id,hs_lastmodifieddate
```

**Results:**

| Deal ID | Buyer | Deal Stage | Stage Label | Owner | Last Modified |
|---------|-------|-----------|-------------|-------|--------------|
| 488031909084 | (empty — deleted?) | — | — | — | — |
| 493050057960 | Office Pantry | `4443390198` | Proposal | Adam | 2026-03-19 |
| 494016518370 | Olive Catering | `4443390198` | Proposal | Danny | 2026-03-24 |
| 494017428715 | Kauai | `4443390198` | Proposal | Adam | 2026-03-26 |
| 494017450175 | Farmer J | `4443390193` | Discovery | Issy | 2026-03-20 |
| 494057891020 | Rich Terry @ BM Caterers | `4443390197` | Feedback Received | Danny | 2026-03-24 |
| 494058225876 | Leicester University | `4443390193` | Discovery | Danny | 2026-03-26 |
| 494058807500 | Salad Project | `4443390195` | Follow Up | Issy | 2026-03-19 |
| 494058920178 | CBRE (Baxterstorey) | `4443390197` | Feedback Received | Danny | 2026-03-27 |
| 494059310280 | Scottish Govt Offices | `4443390198` | Proposal | Danny | 2026-03-26 |
| 494059635961 | University of Nottingham | `4443390199` | Won | Danny | 2026-03-20 |
| 494190615785 | Blue Tiger | `4443390197` | Feedback Received | Adam | 2026-03-26 |
| 494191844569 | goodnus | `4443390199` | Won | Danny | 2026-03-26 |
| 494413252831 | Newcastle University | `4443390198` | Proposal | Danny | 2026-03-24 |

### Deal Stage Mapping (Buyer Deal Pipeline)

| Stage ID | Label |
|----------|-------|
| `4443390193` | Discovery |
| `4443390195` | Follow Up |
| `4443390196` | Feedback Pending |
| `4443390197` | Feedback Received |
| `4443390198` | Proposal |
| `4443390199` | Won |
| `4443390200` | No Response |
| `3774636266` | Lost |

### Owner ID Mapping

| ID | Name |
|----|------|
| `29590940` | Danny Armstrong |
| `30525450` | Morgan West |
| `30585413` | Simon Greenwood-Haigh |
| `33030680` | Ollie Gough |
| `74984940` | Huw Roberts |
| `76825862` | Issy Kluk |
| `78420301` | Will Gatus |
| `89049321` | Mithil Ruparelia |
| `115118133` | Adam Priest |
| `118594265` | Charlie Knight |

**Learning:** The deal owner is **not** the Client Service owner. MOJU's Client Service is owned by Adam, but 8/14 deals are owned by Danny. Multiple operators work the same client's buyers. The summary should show per-operator breakdown.

**Learning:** Deal `488031909084` (the "itsu" deal) returned empty — likely deleted. But Brand records referencing it still exist (`MOJU / itsu - New Deal [488031909084]`). Orphaned brands are a thing. The skill should handle missing/deleted deals gracefully.

### Deal Stage vs Brand Stage Mismatch

| Buyer | Deal Stage | Brand Stage | Match? |
|-------|-----------|-------------|--------|
| Office Pantry | Proposal | Waiting for Feedback | Yes (Proposal → Waiting for Feedback via cascade) |
| Olive Catering | Proposal | Waiting for Feedback | Yes |
| Kauai | Proposal | Waiting for Feedback | Yes |
| Farmer J | Discovery | Brand Pitched | Yes |
| BM Caterers | Feedback Received | Proposal | Yes |
| Leicester University | Discovery | Brand Pitched | Yes |
| Salad Project | Follow Up | Waiting | Yes |
| CBRE | Feedback Received | Proposal | Yes |
| Scottish Govt | Proposal | Waiting for Feedback | Yes |
| Uni of Nottingham | Won | Won | Yes |
| Blue Tiger | Feedback Received | Proposal | Yes |
| goodnus | Won | Proposal | **NO** — deal Won but Brand still at Proposal |
| Newcastle Uni | Proposal | Waiting for Feedback | Yes |

**Learning:** The Deal → Brand stage cascade mapping is:

```
Deal Discovery       → Brand Pitched (NOT via cascade — Brand created at this stage)
Deal Follow Up       → Brand Waiting
Deal Feedback Pending → Brand Samples Requested
Deal Feedback Received → Brand Proposal
Deal Proposal        → Brand Waiting for Feedback
Deal Won             → Brand Won (via Product Pitch → Placed → Brand Won cascade)
```

The **goodnus** mismatch (Deal Won but Brand at Proposal) means the "Won" cascade didn't complete. Either Product Pitches weren't moved to "Product Placed", or the cascading win workflow didn't fire. This is a data quality issue the summary should flag.

---

## Step 4: Fetch Product Pitches

**Query:**
```
POST /crm/v3/objects/0-420/search
{
  "filterGroups": [{"filters": [{"propertyName": "client_name_sync", "operator": "EQ", "value": "MOJU"}]}],
  "properties": ["hs_name", "hs_pipeline_stage", "hs_price", "amount", "reason"],
  "limit": 100
}
```

**Result:** 69 pitches, all on a single page.

**All 69 pitches are at stage `6f14f8f1-407b-4b5b-99a7-db681b779076` = Proposed.**

Zero pitches at Negotiation, Product Placed, Declined, or Discontinued.

### Product Pitch Pipeline Stage Mapping

**IMPORTANT:** The "Proposed" stage uses a UUID, not a numeric ID. The other stages use numeric IDs. This is inconsistent and the existing `hubspot-api-query` skill has the wrong ID for Proposed.

| Stage ID | Label |
|----------|-------|
| `6f14f8f1-407b-4b5b-99a7-db681b779076` | **Proposed** |
| `4549842107` | Negotiation |
| `4549842108` | Product Placed |
| `4549842109` | Declined |
| `4549842110` | Discontinued |

**Learning:** The skill documents Proposed as `4549842107`, but the actual live data uses the UUID `6f14f8f1-...`. The numeric IDs have shifted by one — `4549842107` is actually Negotiation. **This is a bug in the skill that needs fixing.**

**Learning:** All 69 pitches at "Proposed" — even for Won deals (University of Nottingham, goodnus) — means operators are not updating Product Pitch stages. The "won" outcome is tracked at the Deal level, not propagated down to individual pitches. This limits the usefulness of Product Pitch data for the summary. The summary should use Deal stage as the primary status indicator, with Product Pitch counts as supplementary.

---

## Step 5: Fetch Activity (Meetings and Notes)

**Query (per deal):**
```
GET /crm/v3/objects/deals/{dealId}/associations/meetings
GET /crm/v3/objects/deals/{dealId}/associations/notes
```

**Results (6 most recently modified deals checked):**

| Deal | Meetings | Notes |
|------|----------|-------|
| CBRE (Baxterstorey) | 1 | 0 |
| Blue Tiger | 0 | 0 |
| Kauai | 2 | 0 |
| goodnus | 1 | 0 |
| Leicester University | 0 | 0 |
| Scottish Govt Offices | 0 | 0 |

**Learning:** Activity logging is sparse. Only 3 of 6 active deals have any meetings, and zero notes. This is consistent with the system guide's observation that operators communicate outside HubSpot. The summary should note activity volume but not rely on it for narrative.

---

## Data Issues Discovered

### 1. Orphaned Brand records
Deal `488031909084` (itsu) no longer exists, but Brand records referencing it still have data (6 product pitches). The summary must handle missing deals gracefully — show the buyer with a note that the underlying deal was deleted or not found.

### 2. Product Pitch stages not maintained
All 69 pitches at "Proposed" regardless of deal outcome. Won deals should have pitches at "Product Placed". This means:
- **Don't use Product Pitch stage** as the primary indicator of success
- **Use Deal stage** (Won/Lost) as the authoritative outcome
- Product Pitch counts are useful as "how many SKUs are in play" but not "how many placed"

### 3. Stage ID discrepancy in skill
The `hubspot-api-query` skill has incorrect Product Pitch stage IDs. Proposed is a UUID, not `4549842107`. This needs correcting.

### 4. goodnus Deal/Brand stage mismatch
Deal is Won but Brand is stuck at Proposal. The cascading win (Product Pitch → Placed → Brand → Won) didn't fire because no pitches were moved to "Product Placed". The summary should flag these mismatches.

### 5. Duplicate Brands inflate raw numbers
Without deduplication, MOJU appears to have 104 buyer relationships instead of 14. Any summary must deduplicate by `deal_id` extracted from the Brand `hs_name` field.

---

## Summary Output Structure (Draft)

Based on this exercise, the summary should contain:

### 1. Client header
- Client name, MRR, contract stage, start date, owner
- Source: Client Service (`0-162`) record

### 2. Pipeline overview (numbers)
- Total unique buyers
- Breakdown by deal stage: Discovery / Follow Up / Feedback Pending / Feedback Received / Proposal / Won / Lost / No Response
- Source: Deals fetched via Brand `hs_name` → deal ID extraction

### 3. Buyer detail table
Per buyer:
- Buyer name
- Deal stage (from Deal, not Brand — Deal is more reliable)
- Operator (deal owner)
- Products pitched (from Brand `total_number_of_products`)
- Last modified date
- Any data issues (stage mismatch, orphaned brand, etc.)

### 4. Operator breakdown
- Which operators are working this client's buyers
- Deal count per operator

### 5. Data quality notes
- Duplicate brand count
- Orphaned brands
- Stage mismatches
- Product pitch maintenance gaps

---

## Query Sequence for the Skill

The optimal query sequence, minimising API calls:

```
1. POST /crm/v3/objects/0-162/search          → Find Client Service by name
   (1 call)

2. POST /crm/v3/objects/0-970/search           → All Brands for this client
   (1-2 calls, paginate at 100)                   via client_name_sync filter

3. Extract deal IDs from Brand hs_name          → No API call, regex parsing

4. GET /crm/v3/objects/deals/{id}               → Deal details per unique deal
   (N calls, where N = unique buyers)              properties: dealname, dealstage,
                                                   pipeline, hubspot_owner_id,
                                                   hs_lastmodifieddate

5. GET /crm/v3/objects/deals/{id}/associations/meetings  → Activity per deal
   GET /crm/v3/objects/deals/{id}/associations/notes     (2N calls)
   (Optional — skip if not needed for client-facing summary)
```

**Total API calls for MOJU:** 1 + 2 + 14 + 28 = **45 calls**
**Without activity check:** 1 + 2 + 14 = **17 calls**

---

## Key Decisions for the Skill

1. **Use Deal stage as primary status** — not Brand stage (Brand is redundant and sometimes stale)
2. **Deduplicate Brands** by deal_id from `hs_name` — essential to avoid inflated counts
3. **Handle deleted deals** — Brand records can outlive their deals
4. **Flag data quality issues** inline — mismatches, missing pitch maintenance, duplicates
5. **Show operator breakdown** — multiple people work one client's buyers
6. **Product pitch counts are informational only** — stages aren't maintained, so don't report pitch outcomes
7. **Activity data is sparse** — include meeting/note counts but don't build narrative from them
8. **Client Service stage needs pipeline query** — stage IDs aren't fully documented in the skill
