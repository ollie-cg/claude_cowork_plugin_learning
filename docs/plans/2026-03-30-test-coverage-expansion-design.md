# Test Coverage Expansion — Client Operations & Loss Paths

**Date:** 2026-03-30
**Scope:** 8 new test processes for the workflow test harness
**Focus areas:** Client-side operations (zero coverage today) and loss/cascade paths (never tested)

---

## Context

The existing 5 test processes all cover the **buyer side**: creating buyer companies/deals, progressing buyer pipelines, updating brands and product pitches. The entire client acquisition side of the business — Client Deals, Client Services, Client Products, Contact role associations — has zero test coverage. The loss cascade path (pitches declined -> brand lost -> deal lost) is documented but never tested.

This design adds 8 new processes that fill these gaps, using the same harness format and conventions as the existing tests.

## Prerequisites completed

Before writing these tests, we investigated the live HubSpot account to collect all the stage IDs, properties, and association types needed. Key findings:

- **Client Deal Pipeline** (`2760762585`): 7 stages, all IDs captured (Discovery `3774636253` through Closed Lost `3774636259`)
- **Client Service Pipeline** (`ba9cdbd6-e220-45b2-a5a2-d67ebdcbade6`): 16 stages, all IDs captured
- **Client Product Pipeline** (`9dd7104c-1ae0-402b-a194-9cc567fd6a45`): 2 stages (Open `3e1a235d-...`, Closed `38942bdc-...`)
- **Contact -> Client Service role associations**: Administration (6), Logistics (2), Reporting (4), Finance (8)
- **Client Product -> Client Service association**: type `1139`
- **Client Deal properties**: `type=CLIENT`, `amount`, `length_of_contract__months_`, `customer_profile` (10-value enum), `do_you_want_to_recycle_this_deal_client`
- **0 won Client Deals exist** — no automation verified for Client Deal -> Client Service auto-creation

---

## Test data conventions

All test data follows the existing `[TEST]` prefix convention for reliable cleanup.

### Company names and domains

Each process uses a unique fictional company. Domains use the `test` prefix to avoid collisions with real companies.

| Process | Company | Domain | City |
|---------|---------|--------|------|
| `client.onboard` | [TEST] Sunrise Smoothies Ltd | testsunrisesmoothies.com | London |
| `client.pipeline_progression` | [TEST] Clearwater Beverages | testclearwaterbev.com | Birmingham |
| `client.deal_close_lost` | [TEST] Redhill Organics | testredhillorganics.com | Brighton |
| `chain.cascading_loss` | [TEST] Ferndale Food Hall | testferndalefoodhall.com | Cardiff |
| `chain.product_pitch_creation` | [TEST] Ashford Fresh Market | testashfordfresh.com | Canterbury |
| `client.service_update` | (uses existing test Client Service — creates [TEST] record) | N/A | N/A |
| `client.product_create` | (creates [TEST] Client Product, associates to existing Client Service) | N/A | N/A |
| `contact.role_associations` | (creates [TEST] contact, associates to existing Client Service) | N/A | N/A |

### Teardown strategy

Every process has explicit teardown that deletes records **in dependency order** (children before parents). The harness also runs a pre-cleanup sweep before each tier that searches all object types for `[TEST]` records and deletes them, catching any orphans from failed previous runs.

For processes that create Product Pitches (auto-created by workflows), teardown must:
1. Search for all Product Pitches associated to the test Brand
2. Delete each one individually
3. Then delete the Brand, Deal, and Company

The existing `pitch.update` test already handles this pattern via the fallback search mechanism in the harness (`_fallback_teardown`).

### Handling workflow-created records

The cascading loss and product pitch creation tests trigger HubSpot workflows that auto-create records. These records:
- Are **not prefixed with [TEST]** in their names (workflows set names like `CLIENT / BUYER [Deal ID]`)
- Are **associated to test records** (the test Deal/Brand)
- Must be found via association queries, not name-based search

Teardown for these tests captures the Brand ID during verification, then uses association queries to find auto-created Product Pitches before deleting them.

---

## Process designs

### 1. `client.onboard`

**Category:** `client_management`
**Complexity:** Simple
**What it tests:** Creating a company, contact, and deal in the Client Deal Pipeline with client-specific properties.

**Prompt:** Create a company, create a contact and associate to it, then create a deal in the Client Deal Pipeline at Discovery. Set `type=CLIENT`, `amount=4500`, `length_of_contract__months_=12`, `customer_profile=QSR & Casual Dining`. Associate the deal to the company.

**Verification actions:**

1. `create_company` — Search by domain `testsunrisesmoothies.com`. Assert name, domain, city, country.
2. `create_contact_and_associate` — Search by email. Assert name, email, job title. Assert associated to company.
3. `create_deal_and_associate` — Search by deal name. Assert:
   - `pipeline` = `2760762585` (Client Deal Pipeline, NOT Buyer)
   - `dealstage` = `3774636253` (Discovery)
   - `type` = `CLIENT`
   - `amount` = `4500`
   - `customer_profile` = `QSR & Casual Dining`
   - Associated to company

**Teardown:** Delete deal, contact, company.

**What this catches:** Claude confusing Client Deal Pipeline with Buyer Deal Pipeline. Claude failing to set `type=CLIENT`. Claude using wrong stage IDs.

---

### 2. `client.pipeline_progression`

**Category:** `client_management`
**Complexity:** Medium
**What it tests:** Progressing a Client Deal through all 7 stages from Discovery to Closed Won.

**Prompt:** Create a company and Client Deal at Discovery. Move the deal through every stage in order: Discovery -> Meeting Booked -> Proposal -> Negotiation -> Contract Sent -> Closed Won.

**Verification actions:**

1. `create_company` — Search by domain `testclearwaterbev.com`. Assert name, domain, city.
2. `create_deal_and_associate` — Search by deal name. Assert pipeline = `2760762585`, associated to company. Capture `deal_id`.
3. `verify_final_stage_is_closed_won` — Search deal by name. Assert:
   - `dealstage` = `3774636258` (Closed Won)
   - `hs_is_closed` = `true`
   - `hs_is_closed_won` = `true`
4. `verify_all_stages_entered` — Request all `hs_v2_date_entered_*` properties for the 6 stages. Assert each is `not_null`.
5. `verify_stages_in_order` — Assert the `hs_v2_date_entered_*` timestamps are chronological.

**Teardown:** Delete deal, company.

**What this catches:** Claude using wrong stage IDs for Client Deal Pipeline. Claude skipping stages. Claude confusing Client stage IDs with Buyer stage IDs (both pipelines have a "Discovery" stage but with different IDs).

**Note on Client Service auto-creation:** The candidate-test-workflows doc speculates that a workflow auto-creates a Client Service when a Client Deal reaches Closed Won (workflow `3150549212`). However, 0 Client Deals have reached Closed Won in production, so this is unverified. If the test discovers that a Client Service IS auto-created, we should record that as a finding and add it to the skill. If it is NOT auto-created, that's also a finding — it means Client Services are created manually. **Do not modify the test to accommodate either outcome. Report what happens.**

---

### 3. `client.deal_close_lost`

**Category:** `client_management`
**Complexity:** Simple
**What it tests:** Moving a Client Deal to Closed Lost and verifying the loss-path properties.

**Prompt:** Create a company and Client Deal at Discovery. Move the deal to Negotiation, then to Closed Lost.

**Verification actions:**

1. `create_company` — Search by domain `testredhillorganics.com`. Assert name, city.
2. `create_deal_and_associate` — Search by deal name. Assert pipeline = `2760762585`. Capture `deal_id`.
3. `verify_deal_closed_lost` — Search deal by name. Assert:
   - `dealstage` = `3774636259` (Closed Lost)
   - `hs_is_closed` = `true`

**Teardown:** Delete deal, company.

**What this catches:** Claude unable to move deals to closed-lost stages. Wrong stage ID for Closed Lost.

---

### 4. `chain.cascading_loss`

**Category:** `automation_chain`
**Complexity:** Complex
**What it tests:** The full loss cascade: all Product Pitches -> Declined -> Brand -> Lost -> Deal -> Lost.

This is the most complex test. It exercises the entire automation chain in reverse (the loss path, vs the win path tested in `buyer.pipeline_progression`).

**Prompt:**
1. Create a company and Buyer Deal at Discovery (associate GLUG! Client Service — fewer products than MOJU, so fewer pitches to manage).
2. Wait for Brand auto-creation.
3. Progress deal through Follow Up -> Feedback Pending -> Feedback Received (which cascades Brand to Proposal, triggering Product Pitch creation).
4. Wait for Product Pitches to be created.
5. Move ALL Product Pitches to Declined.
6. Report what happened to the Brand and Deal stages after all pitches were declined.

**Verification actions:**

1. `create_company` — Search by domain `testferndalefoodhall.com`. Assert name.
2. `create_deal_and_associate` — Search by deal name. Assert pipeline = `2760762586` (Buyer Deal Pipeline), dealstage = `4443390193` (Discovery). Capture `deal_id`.
3. `verify_brand_created` — Search Brand by `buyer_name` containing "Ferndale". Assert `client_name_sync` = `GLUG!`. Capture `brand_id`.
4. `verify_pitches_created` — Search Product Pitches by `hs_name` containing "Ferndale". Assert at least one result exists. Assert `hs_pipeline_stage` = `4549842109` (Declined) on the first result found.
   - **Note:** By this point in the test, the prompt has already moved all pitches to Declined. We verify they ended up there.
5. `verify_brand_cascaded_to_lost` — Search Brand by `buyer_name` containing "Ferndale". Assert `hs_pipeline_stage` = `4447561939` (Lost).
6. `verify_deal_cascaded_to_lost` — Search deal by name. Assert `dealstage` = `3774636266` (Lost).

**Teardown:**
1. Search Product Pitches by `hs_name` containing "Ferndale" — delete all matches (fallback search).
2. Delete Brand by captured `brand_id`.
3. Delete Deal by captured `deal_id`.
4. Delete Company by captured `company_id`.

**What this catches:** The loss cascade not working (Brand stays at Proposal even though all pitches are Declined). Deal not cascading to Lost. Timing issues — the cascading workflows take time and Claude may need to wait.

**Important:** If the Brand or Deal does NOT cascade to Lost after all pitches are Declined, **record this as a finding**. It could mean:
- The cascading workflow has a delay longer than the test allows
- The cascading loss automation doesn't exist or is broken
- Claude didn't actually move all pitches to Declined

Do not change the test assertions to match unexpected behaviour. Flag it.

---

### 5. `chain.product_pitch_creation`

**Category:** `automation_chain`
**Complexity:** Complex
**What it tests:** Product Pitch auto-creation — correct count, associations, and initial state.

**Prompt:**
1. Create company and Buyer Deal at Discovery (associate GLUG! Client Service).
2. Wait for Brand auto-creation.
3. Progress deal through Follow Up -> Feedback Pending -> Feedback Received (Brand cascades to Proposal, triggering Product Pitch creation).
4. Wait 15 seconds for pitches to be created.
5. List all Product Pitches associated to the Brand. Report: count, names, stages, and whether each is associated to the Brand.

**Verification actions:**

1. `create_company` — Search by domain `testashfordfresh.com`. Assert name.
2. `create_deal_and_associate` — Search by deal name. Assert pipeline = `2760762586`. Capture `deal_id`.
3. `verify_brand_at_proposal` — Search Brand by `buyer_name` containing "Ashford". Assert `hs_pipeline_stage` = `4447561936` (Proposal). Capture `brand_id`.
4. `verify_pitches_exist` — Search Product Pitches by `hs_name` containing "Ashford". Assert at least one result exists. Assert first result's `hs_pipeline_stage` = `6f14f8f1-407b-4b5b-99a7-db681b779076` (Proposed). Assert `client_name_sync` = `GLUG!`.

**Teardown:**
1. Search Product Pitches by `hs_name` containing "Ashford" — delete all matches.
2. Delete Brand.
3. Delete Deal.
4. Delete Company.

**What this catches:** Product Pitches not being created (workflow timing). Pitches created at wrong stage. Pitches missing `client_name_sync`. Wrong number of pitches relative to Client Products.

**Note on pitch count:** GLUG! has an unknown number of Client Products. The test asserts "at least 1 pitch exists" rather than an exact count, because we don't want to hardcode a count that could change if products are added/removed. If you need to verify the exact count, query GLUG!'s Client Products first and compare.

---

### 6. `client.service_update`

**Category:** `client_management`
**Complexity:** Simple
**What it tests:** Updating fields on a Client Service record (MRR, dates, category).

**Prompt:** Create a new Client Service record called "[TEST] Harness Test Brand" in the Service Pipeline at "In Contract" stage. Set `mrr` to 3500, `hs_category` to "OOH", and `original_start_date` to 2026-01-15. Then read it back to confirm the values were set.

**Verification actions:**

1. `verify_service_created` — Search Client Service (`0-162`) by `hs_name` = "[TEST] Harness Test Brand". Assert:
   - `hs_name` = `[TEST] Harness Test Brand`
   - `hs_pipeline_stage` = `3843969243` (In Contract)
   - `mrr` = `3500`
   - `hs_category` contains `OOH`
   - `original_start_date` = `2026-01-15`

Capture `service_id`.

**Teardown:** Delete Client Service by captured `service_id`.

**What this catches:** Claude unable to create or update Client Service records. Wrong pipeline/stage IDs for the Service Pipeline. Claude not knowing the `mrr` or `hs_category` field names.

---

### 7. `client.product_create`

**Category:** `client_management`
**Complexity:** Medium
**What it tests:** Creating a Client Product with key commercial and physical fields, and associating it to a Client Service.

**Prompt:** Create a Client Product (`0-410`) called "[TEST] Ginger Immunity Shot 60ml" with these fields:
- `product_brand`: "Test Brand"
- `product_category`: "Chilled"
- `product_description`: "Cold-pressed ginger shot with turmeric and black pepper. Vegan. Gluten-free."
- `case_size`: 12
- `uk_rsp`: 2.49
- `wholesaler_case_cost`: 18.00
- `retail_ean`: 5060000000001
- `case_ean`: 5060000000002
- `ingredients_english`: "Ginger juice (45%), apple juice, lemon juice, turmeric extract, black pepper extract"
- `country_of_origin`: "United Kingdom"
- `single_unit_net_weight_g`: 60
- `per_1__energy_kjkcal`: "50kJ/12kcal"
- `per_1__fat`: "0.1g"
- `per_1__carbohydrate`: "2.5g"
- `per_1__protein`: "0.2g"
- `per_1__salt`: "0.01g"

Associate the Client Product to the MOJU Client Service.

**Verification actions:**

1. `verify_product_created` — Search Client Product (`0-410`) by `hs_course_name` containing "[TEST] Ginger Immunity Shot". Assert:
   - `hs_course_name` contains `Ginger Immunity Shot`
   - `product_category` = `Chilled`
   - `case_size` = `12`
   - `uk_rsp` = `2.49`
   - `wholesaler_case_cost` = `18.00`
   - `ingredients_english` contains `Ginger juice`
   - `country_of_origin` = `United Kingdom`

Capture `product_id`.

2. `verify_product_associated_to_service` — Check associations from the Client Product to Client Service (`0-162`). Assert associated to the MOJU Client Service.

**Teardown:** Delete Client Product by captured `product_id`.

**What this catches:** Claude not knowing the field names for Client Product (e.g. `hs_course_name` instead of just `name`). Claude unable to associate between two custom object types. Claude confusing `per_1__*` fields.

**Note:** The Client Product name field is `hs_course_name` (repurposed from HubSpot's native "Course" object). If Claude uses a different field name, the product will be created but the name won't appear in the UI. The test will catch this because the search will return 0 results.

---

### 8. `contact.role_associations`

**Category:** `contact_management`
**Complexity:** Medium
**What it tests:** Creating role-based contact associations to a Client Service.

**Prompt:** Create a contact called "[TEST] Alex Harper" with email alex.harper@testharnesscontact.com, job title "Operations Manager". Then associate this contact to the MOJU Client Service with the role "Reporting". Also associate the contact with the role "Finance".

**Verification actions:**

1. `verify_contact_created` — Search by email `alex.harper@testharnesscontact.com`. Assert firstname, lastname, email, jobtitle. Capture `contact_id`.
2. `verify_reporting_association` — Check associations from contact to Client Service (`0-162`). Assert associated to the MOJU Client Service.
   - **Note:** The harness's `associated_to` assertion checks for the existence of an association, but doesn't currently verify the role label. This is a known limitation — the association will be verified as existing, but we can't distinguish "Reporting" from "Finance" from "default" via the current assertion. This is acceptable for now. If role verification matters, we'd need to add a new assertion operator that checks the v4 association labels endpoint.

**Teardown:** Delete contact by captured `contact_id`. (Associations are automatically removed when the contact is deleted.)

**What this catches:** Claude not knowing the association type IDs for role-based associations (6=Administration, 2=Logistics, 4=Reporting, 8=Finance). Claude using the wrong API endpoint for creating labelled associations.

---

## Harness changes needed

### New assertion: none required

All 8 processes use existing assertion operators (`eq`, `contains`, `not_null`, `associated_to`, `timestamps_chronological`). No new operators are needed.

### Fallback teardown additions

The `_fallback_teardown` function's `search_field_map` needs two additions for reliable cleanup:

```python
# Existing:
"0-420": "hs_name",
"0-970": "buyer_name",

# Add:
"0-162": "hs_name",
"0-410": "hs_course_name",
```

This ensures that if a test fails mid-way and doesn't capture IDs for Client Service or Client Product records, the pre-cleanup sweep can still find and delete `[TEST]` records.

### Verify delay for cascade tests

The cascade tests (`chain.cascading_loss`, `chain.product_pitch_creation`) depend on multiple sequential HubSpot workflows firing. The current `VERIFY_DELAY` of 5 seconds may not be enough. However, the **prompt itself** instructs Claude to wait (e.g. "wait 15 seconds for Product Pitches to be created"), so the delay between Claude's session ending and verification starting is separate from the workflow timing.

If verification consistently fails with "search returned no results" on cascade tests, increase `VERIFY_DELAY` to 10-15 seconds for those tests specifically. But try the default first — don't pre-optimise.

---

## What these tests do NOT cover

These 8 tests are all **write operations** with post-verification. The following remain uncovered and would need harness infrastructure changes:

- **Read-only queries** (query.buyers_for_client, query.pipeline_report, etc.) — needs a verification model that compares Claude's answer against expected results, not just checks that records exist
- **Data quality detection** (duplicate flagging, broken rollup awareness) — needs qualitative verification ("did Claude mention this issue?")
- **Lead creation** — simple to add later, same pattern as these tests
- **Dynamic owner lookup** — needs the SKILL.md update to replace hardcoded tables (in progress)

These are deliberately deferred. The 8 tests above cover the highest-value gaps that the harness can handle today.

---

## Implementation order

1. **Update `search_field_map`** in `test_harness.py` — add `0-162` and `0-410` entries (2 lines)
2. **Add the 3 simple tests first** — `client.onboard`, `client.deal_close_lost`, `client.service_update`
3. **Add the 2 medium tests** — `client.pipeline_progression`, `client.product_create`
4. **Add the medium test requiring existing data** — `contact.role_associations`
5. **Add the 2 complex cascade tests last** — `chain.product_pitch_creation`, `chain.cascading_loss`
6. **Run each test individually** (`--process X --tier B`) to validate before running the full suite
7. **Record findings** — if any test reveals unexpected behaviour (e.g. Client Service not auto-created at Closed Won, or loss cascade not firing), document it in `docs/issues/` rather than modifying the test to pass

---

## Principles

- **All test data uses `[TEST]` prefix.** Every company, deal, contact, product, and service name starts with `[TEST]`.
- **All test data is cleaned up.** Teardown runs regardless of pass/fail. Pre-cleanup sweeps catch orphans.
- **Tests assert what SHOULD happen, not what DOES happen.** If the system behaves unexpectedly, the test fails and we investigate — we don't change the test to match broken behaviour.
- **Workflow timing is handled in the prompt, not the harness.** The prompt tells Claude to wait for auto-created records. The harness waits `VERIFY_DELAY` seconds after Claude finishes. If both waits aren't enough, we increase the delay — we don't skip the verification.
- **Findings are documented, not hidden.** If a test reveals that a documented workflow doesn't actually exist (e.g. Client Service auto-creation), that's a valuable finding. Write it up.
