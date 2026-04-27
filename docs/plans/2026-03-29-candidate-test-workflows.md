# Candidate Test Workflows

Comprehensive list of workflows we could add to the test harness, covering entity gaps, read-only queries, and operations not currently tested. Organised by category. Each entry includes what it tests, why it matters, and a difficulty estimate.

Excludes presentation generation (`generate-buyer-deck`) and client summary (`client-summary`) skills — those are validated outside the harness.

---

## Category: Client Deal Pipeline

The entire client acquisition side of the business is untested.

### `client.onboard`

- **Tests:** Create Company, Contact, Deal in Client Deal Pipeline at Discovery. Set client-specific properties (`scope_of_work`, `commission_rate`, `billing_frequency`, `notice_period`).
- **Why it matters:** Client acquisition is half the business. Validates Claude can distinguish between Client Deal Pipeline (`2760762585`) and Buyer Deal Pipeline (`2760762586`) and set the right property group (`client_information` vs `buyer_information`).
- **Difficulty:** Simple — mirrors `buyer.onboard` but with different pipeline and properties.

### `client.pipeline_progression`

- **Tests:** Create a Client Deal, move it through all 7 stages: Discovery → Meeting Booked → Proposal → Negotiation → Contract Sent → Closed Won → (verify Client Service auto-created).
- **Why it matters:** Validates the Client Deal → Closed Won → Client Service auto-creation workflow (`3150549212`). This is how new clients enter the system. Also tests that Claude can progress through a pipeline with different stage IDs from the Buyer pipeline.
- **Difficulty:** Medium — needs to wait for the Client Service auto-creation workflow to fire, then verify the new `0-162` record exists with correct `hs_name`.

### `client.deal_close_lost_recycle`

- **Tests:** Create a Client Deal, move to Closed Lost with `recycle = YES (IN 6 MONTHS)`. Verify the deal properties are set correctly.
- **Why it matters:** Tests the loss path and recycle flag. Can't verify the 180-day wait in a test, but can confirm Claude sets the right fields for the recycling workflow to pick up later.
- **Difficulty:** Simple — create, move, verify properties.

---

## Category: Client Service Management

No tests currently touch Client Service CRUD or lifecycle.

### `service.update_contract`

- **Tests:** Find an existing Client Service by name (`0-162` search), update operator fields: `mrr`, `hs_start_date`, `hs_close_date`, `billing_frequency`, `notice_period`. Read back to verify.
- **Why it matters:** Client Service records hold contract terms. Operators need Claude to update MRR and dates correctly. Also validates that Claude can search custom objects by `hs_name` and update them.
- **Difficulty:** Simple — search + update + verify. Uses an existing record (no create/teardown needed if using a test-prefixed temporary record).

### `service.create_with_products`

- **Tests:** Create a Client Service (`0-162`) with contract fields, then create 2-3 Client Product records (`0-410`) with product spec fields (EAN, case size, dimensions, at least some nutritional fields). Associate the Client Products to the Client Service.
- **Why it matters:** This is the onboarding data entry workflow — the heaviest manual process in the system. Tests that Claude can write to Client Product's 67-field schema and correctly associate to a Client Service.
- **Difficulty:** Medium — many fields on Client Product, need to verify associations between two custom object types.

---

## Category: Client Product Operations

Client Products are the richest data entity (67 fields) with zero test coverage.

### `product.create_full_spec`

- **Tests:** Create a Client Product (`0-410`) with a comprehensive set of fields: identity (name, EAN, case EAN), commercial (RSP, wholesale cost, case size, VAT), physical (unit and case dimensions in mm, weights in g, pallet qty), nutritional (energy, fat, saturates, carbs, sugars, fibre, protein, salt — both per-serving and per-100g), and metadata (ingredients, allergens, country of origin, manufacturer, shelf life).
- **Why it matters:** Product data entry from client spreadsheets is a core workflow. Validates Claude can handle the full field schema without confusing similarly-named fields (e.g., `per_1__fat` vs `per_2__fat`, `unit_depth_mm` vs `case_depth_mm`).
- **Difficulty:** Medium — large number of fields to set and verify, but straightforward CRUD.

### `product.update_nutritional`

- **Tests:** Find an existing Client Product, update only the nutritional fields (both per-serving and per-100g variants). Verify the update didn't blank out other fields.
- **Why it matters:** Nutritional data often arrives separately from commercial data. Tests partial updates on a field-heavy object.
- **Difficulty:** Simple — search + partial update + verify.

---

## Category: Lead Management

5 lead workflows documented, zero test coverage.

### `lead.create_buyer`

- **Tests:** Create a Lead in the Buyer Pipeline (`2761663691`) with company info and contact details. Verify it's at the correct initial stage.
- **Why it matters:** Leads are the top of the funnel. Tests that Claude knows the Lead object type (`0-136`) and can place records in the correct pipeline.
- **Difficulty:** Simple — but need to discover the Buyer Lead Pipeline stage IDs first (not fully documented in the skill).

### `lead.create_client`

- **Tests:** Create a Lead in the Client Lead Pipeline with client-specific fields.
- **Why it matters:** Client leads feed into the Client Deal Pipeline via workflow `3058177272`. Same entity, different pipeline — tests Claude's pipeline awareness.
- **Difficulty:** Simple — same as above but different pipeline.

---

## Category: Contact Role Associations

The system has 4 custom role-based associations on Contact → Client Service, none tested.

### `contact.role_associations`

- **Tests:** Create a Contact, associate it to an existing Client Service with each of the 4 custom roles: Reporting, Finance, Logistics, Administration. Verify each association exists with the correct role label.
- **Why it matters:** Role-based associations are the only custom association types in the system. Tests that Claude can create typed associations (not just default ones). Real use case: onboarding a new client and assigning contact roles.
- **Difficulty:** Medium — need to discover the association type IDs for each role (not currently in the skill), then create and verify 4 separate associations.

---

## Category: Cross-Entity Read Queries

The most common real-world use case (asking Claude questions) has zero test coverage.

### `query.buyers_for_client`

- **Tests:** Query "which buyers stock [client]?" — search Brand (`0-970`) by `client_name_sync`, filter by stage = Won, return `buyer_name` for each. Verify the answer includes known won buyers and excludes lost/open ones.
- **Why it matters:** This is the #1 query recipe in the skill. Validates the core read path through Brand records. Also tests that Claude uses `client_name_sync` (not a name-based object query) and filters by the correct Won stage ID.
- **Difficulty:** Simple — single search with filter. Verification compares results against known data.

### `query.products_placed`

- **Tests:** Query "how many products has [client] placed?" — search Product Pitch (`0-420`) by `client_name_sync`, filter by stage = Product Placed (`4549842108`). Count results. Verify Claude does NOT use the broken `products_placed` rollup field on Brand.
- **Why it matters:** Tests the most important data quality workaround: the `products_placed` rollup is broken (always 0), so Claude must query Product Pitches directly. If Claude trusts the rollup, it reports 0 even for Won brands.
- **Difficulty:** Simple — but verification needs to check that the approach is correct (direct query, not rollup), not just the final number.

### `query.pipeline_report`

- **Tests:** Query "pipeline report for [client]" — search Brand (`0-970`) by `client_name_sync`, group by `hs_pipeline_stage`, count unique buyers per stage. Verify stage counts are correct.
- **Why it matters:** Pipeline reports are a daily management use case. Tests aggregation across Brand records and correct stage-to-label mapping.
- **Difficulty:** Medium — requires grouping/counting logic, not just a single search.

### `query.activity_for_client`

- **Tests:** Query "activity for [client] this month" — find Client Service → extract Deal IDs from associated Brands → for each Deal, get associated Meetings → filter by date. Verify the multi-hop association traversal returns meetings.
- **Why it matters:** This is the most complex query recipe — 3 hops (Client Service → Brand → Deal → Meeting). Tests that Claude can navigate the association graph. Also validates that Claude flags the known issue of incomplete meeting associations.
- **Difficulty:** Complex — multiple association hops, date filtering, and the expected answer may be incomplete due to the known meeting association gap.

### `query.contacts_at_won_buyers`

- **Tests:** Query "who are our contacts at buyers that have placed [client] products?" — find Won Deals → associated Companies → associated Contacts. Return contact names and companies.
- **Why it matters:** Relationship mapping query — "give me names of people at places where we've won." Tests 3-hop traversal through standard objects.
- **Difficulty:** Medium — multi-hop but through standard objects (deals → companies → contacts).

### `query.nutritional_data`

- **Tests:** Query "what's the nutritional info for [product]?" — search Client Product (`0-410`) by name, return per-serving and per-100g nutritional fields. Verify Claude returns both serving formats and doesn't confuse `per_1__*` with `per_2__*`.
- **Why it matters:** Product spec queries are common when preparing for buyer meetings. Tests that Claude can query the 67-field Client Product object and present nutritional data clearly.
- **Difficulty:** Simple — single search, property retrieval.

---

## Category: Data Quality Detection

The skill documents 5 known data quality issues. No test verifies Claude flags them.

### `query.detect_broken_rollup`

- **Tests:** Query a Brand record known to be at Won stage. Ask Claude for the products-placed count. Verify Claude reports the actual count (from Product Pitch query) and explicitly flags that the `products_placed` rollup field is broken/zero.
- **Why it matters:** The #1 data trap in the system. If Claude trusts the rollup, every report understates placements. The skill's Red Flags table says "The `products_placed` rollup will have the count → Broken — always 0." This test validates enforcement.
- **Difficulty:** Simple — but verification is qualitative (did Claude flag the issue?) not just quantitative.

### `query.detect_duplicates`

- **Tests:** Query Brands for a client known to have duplicates (e.g., MOJU / Farmer J). Ask Claude how many buyer relationships the client has. Verify Claude deduplicates by deal_id from `hs_name` and reports the correct unique count, not the inflated raw count.
- **Why it matters:** Without deduplication, MOJU appears to have 104 buyer relationships instead of 14. Tests whether Claude applies the deduplication logic from the skill or naively counts records.
- **Difficulty:** Medium — requires Claude to implement deduplication logic, not just run a search.

### `query.detect_stage_mismatch`

- **Tests:** Query a Deal known to be at Won but whose Brand is stuck at an earlier stage (e.g., the goodnus case). Ask Claude for the deal status. Verify Claude flags the mismatch between Deal stage and Brand stage.
- **Why it matters:** Stage mismatches indicate broken automation or incomplete operator work. The client-summary learnings doc identified this as a real issue. Tests Claude's ability to cross-reference related records.
- **Difficulty:** Medium — requires comparing data across two entity types.

### `query.detect_null_amounts`

- **Tests:** Query Product Pitch or Brand records and ask for financial data. Verify Claude explicitly states that `amount` fields are null/empty across the system, rather than silently omitting the data or reporting $0.
- **Why it matters:** The skill says "State the data isn't available" rather than silently omitting. Tests that Claude distinguishes between "the value is zero" and "the field is not populated."
- **Difficulty:** Simple — single query, qualitative verification.

---

## Category: Automation Chain Verification

Tests that verify Claude understands and can trigger the automation chain correctly.

### `chain.deal_to_brand_cascade`

- **Tests:** Create a Buyer Deal at Discovery (with Client Service association), then move it through Follow Up → Feedback Pending → Feedback Received → Proposal. After each move, verify the associated Brand's stage cascaded correctly per the mapping table (Follow Up → Waiting, Feedback Pending → Samples Requested, Feedback Received → Proposal, Proposal → Waiting for Feedback).
- **Why it matters:** The Deal → Brand stage cascade is the backbone of the automation system. `buyer.pipeline_progression` moves through all stages but only checks the Deal's final state — this test verifies the Brand cascade at each intermediate step.
- **Difficulty:** Complex — requires checking Brand state after each Deal stage move, with waits for workflow execution (~6 seconds per move).

### `chain.product_pitch_creation`

- **Tests:** Create a Buyer Deal at Discovery with a Client Service that has known Client Products. Progress the Deal to Feedback Received (which cascades Brand to Proposal, which triggers Product Pitch creation). Verify: correct number of Product Pitches created (one per Client Product), each at Proposed stage, each associated to the Brand and its Client Product.
- **Why it matters:** This is the most complex automation chain in the system (Deal → Brand stage cascade → Product Pitch auto-creation). The existing `pitch.update` test does this as a prerequisite but doesn't verify the count or associations in detail.
- **Difficulty:** Complex — multiple waits, association verification, count validation.

### `chain.cascading_loss`

- **Tests:** Starting from a state with a Deal, Brand, and Product Pitches: move all Product Pitches to Declined. Verify Brand cascades to Lost. If multiple Brands exist on the Deal, verify Deal cascades to Lost only when ALL Brands are Lost.
- **Why it matters:** The loss cascade (all pitches declined → Brand lost → all brands lost → Deal lost) is documented but never tested. Gets the full end-of-life path.
- **Difficulty:** Complex — requires a setup with multiple Product Pitches, waits for multiple cascading workflows.

---

## Summary Table

| ID | Category | Read/Write | Difficulty | Entities |
|----|----------|-----------|------------|----------|
| `client.onboard` | Client Deals | Write | Simple | Company, Contact, Deal (Client pipeline) |
| `client.pipeline_progression` | Client Deals | Write | Medium | Deal (Client pipeline) → Client Service |
| `client.deal_close_lost_recycle` | Client Deals | Write | Simple | Deal (Client pipeline) |
| `service.update_contract` | Client Services | Write | Simple | Client Service (`0-162`) |
| `service.create_with_products` | Client Services | Write | Medium | Client Service, Client Product (`0-410`) |
| `product.create_full_spec` | Client Products | Write | Medium | Client Product (`0-410`) |
| `product.update_nutritional` | Client Products | Write | Simple | Client Product (`0-410`) |
| `lead.create_buyer` | Leads | Write | Simple | Lead (`0-136`) |
| `lead.create_client` | Leads | Write | Simple | Lead (`0-136`) |
| `contact.role_associations` | Associations | Write | Medium | Contact → Client Service (4 roles) |
| `query.buyers_for_client` | Read Queries | Read | Simple | Brand (`0-970`) |
| `query.products_placed` | Read Queries | Read | Simple | Product Pitch (`0-420`) |
| `query.pipeline_report` | Read Queries | Read | Medium | Brand (`0-970`) |
| `query.activity_for_client` | Read Queries | Read | Complex | Client Service → Brand → Deal → Meeting |
| `query.contacts_at_won_buyers` | Read Queries | Read | Medium | Deal → Company → Contact |
| `query.nutritional_data` | Read Queries | Read | Simple | Client Product (`0-410`) |
| `query.detect_broken_rollup` | Data Quality | Read | Simple | Brand + Product Pitch |
| `query.detect_duplicates` | Data Quality | Read | Medium | Brand (`0-970`) |
| `query.detect_stage_mismatch` | Data Quality | Read | Medium | Deal + Brand |
| `query.detect_null_amounts` | Data Quality | Read | Simple | Product Pitch / Brand |
| `chain.deal_to_brand_cascade` | Automation | Write | Complex | Deal → Brand (stage verification) |
| `chain.product_pitch_creation` | Automation | Write | Complex | Deal → Brand → Product Pitch (count + associations) |
| `chain.cascading_loss` | Automation | Write | Complex | Product Pitch → Brand → Deal (loss path) |

**Totals:** 23 candidate workflows — 8 simple, 9 medium, 6 complex. 13 write tests, 10 read tests.

---

## Prerequisites / Blockers

Before implementing some of these, the skill needs updates:

1. **Fix Product Pitch stage IDs** — `query.products_placed`, `chain.product_pitch_creation`, and `chain.cascading_loss` all depend on correct stage mappings. See `docs/issues/2026-03-29-product-pitch-proposed-stage-id-wrong.md`.
2. **Add Client Deal Pipeline stage IDs to skill** — `client.onboard` and `client.pipeline_progression` need these. Currently only Buyer Deal stages are in the skill.
3. **Add Lead Pipeline stage IDs to skill** — `lead.create_buyer` and `lead.create_client` need these. Currently undocumented.
4. **Discover Contact → Client Service role association type IDs** — `contact.role_associations` needs these. Not in the skill or system guide.
5. **Read query verification model** — The existing harness verifies write operations by searching for created records. Read-only tests need a different verification approach: the harness would need to compare Claude's answer against expected results from direct API queries. This is a design decision for the harness itself.
