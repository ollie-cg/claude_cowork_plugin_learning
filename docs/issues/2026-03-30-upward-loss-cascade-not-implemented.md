# Upward Loss Cascade Not Implemented in HubSpot

**Date:** 2026-03-30
**Status:** Open
**Affects:** `chain.cascading_loss` test, `hubspot-api-query` SKILL.md, `hubspot-system-guide.md`

## Summary

The upward loss cascade — where all Product Pitches being Declined/Discontinued should cascade Brand to Lost, and all Brands Lost should cascade Deal to Lost — is documented but does not exist as a HubSpot workflow. Only the **downward** cascades are implemented.

## What's documented

Two sources describe this as automated behaviour:

1. **SKILL.md** (~line 189):
   > Cascading outcomes:
   > - Product Pitch → Product Placed → Brand → Won → Deal → Won
   > - All Product Pitches → Declined/Discontinued → Brand → Lost → All Brands Lost → Deal → Lost

2. **hubspot-system-guide.md** (~line 227):
   > Cascading loss — all Product Pitches lost → Brand lost → all Brands lost → Deal lost

## What actually happens

Verified by the `chain.cascading_loss` Tier B test run (`2026-03-30_1101`):

1. Company, Deal, Brand, and 4 Product Pitches created successfully
2. All 4 Product Pitches moved to Declined (confirmed `is_closed = 1`)
3. **Brand stayed at Proposal** — did not move to Lost
4. **Deal stayed at Feedback Received** — did not move to Lost
5. `closed_matching` field on Brand showed `0` despite all pitches being closed

The downward cascades work fine:
- Deal stage progression → Brand stage cascade (confirmed)
- Brand at Proposal → Product Pitch auto-creation (confirmed)

## Related: Brand rollup fields broken

The `closed_matching` field that would logically trigger an upward cascade shows `0` even when all pitches are closed. This is part of a broader issue with Brand rollup fields:

| Field | Expected | Actual |
|-------|----------|--------|
| `closed_matching` | >0 when pitches closed | Always 0 |
| `products_placed` | Count of placed pitches | Always 0 (known bug, documented in SKILL.md) |
| `count_of_closed_products` | Count of closed pitches | 0 or null |

The rollup fields are likely misconfigured in HubSpot's custom object settings — either the rollup criteria or the association path between Brand and Product Pitch is wrong. This needs to be checked in HubSpot admin (Settings > Objects > Brand > Calculated properties).

## Impact

- The `chain.cascading_loss` test will always fail on the cascade assertions (actions 5 and 6)
- Operators must **manually** move Brand to Lost and Deal to Lost after confirming all pitches are declined
- The documented cascade behaviour gives a false impression of automation coverage

## Fix required

**Option A — Build the automation:**
1. Fix Brand rollup fields so `closed_matching` calculates correctly
2. Create a HubSpot workflow: "When Brand `closed_matching` = `total_number_of_products` AND all pitches closed → move Brand to Lost"
3. Create a HubSpot workflow: "When all Brands on a Deal are at Lost → move Deal to Lost"

**Option B — Document as manual:**
1. Update SKILL.md to clarify the upward cascade is a manual operator step, not automated
2. Update hubspot-system-guide.md similarly
3. Update `chain.cascading_loss` test to only verify that pitches were declined (remove cascade assertions), or mark cascade assertions as `expected_fail`

## Source

Discovered during test harness run `2026-03-30_1101` (`chain.cascading_loss` Tier B). Claude's session output confirmed:

> "The upward loss cascade did NOT fire. The documented cascading outcome does not appear to be implemented as an automated workflow. Only the downward cascades (Deal → Brand stage mapping, Brand Proposal → Product Pitch creation) are confirmed working."

## Related

- `docs/issues/2026-03-29-product-pitch-proposed-stage-id-wrong.md` — off-by-one stage IDs (separate issue)
- `tests/process_registry.json` — `chain.cascading_loss` test definition
- `tests/runs/2026-03-30_1101_chain.cascading_loss_tier-B.json` — full test evidence
- `docs/plans/2026-03-27-client-summary-learnings.md` — earlier discovery of rollup issues
