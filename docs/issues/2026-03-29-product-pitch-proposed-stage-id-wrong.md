# Product Pitch "Proposed" Stage ID Is Wrong in Skill

**Date:** 2026-03-29
**Status:** Open
**Affects:** `hubspot-api-query` SKILL.md, and any skill that relies on it for Product Pitch stage mappings (`client-summary`, `hubspot-hygiene-check`, `generate-buyer-deck`)

## Summary

The `hubspot-api-query` skill documents the Product Pitch "Proposed" stage as numeric ID `4549842107`. This is wrong — `4549842107` is actually the **Negotiation** stage. The real "Proposed" stage uses a UUID: `6f14f8f1-407b-4b5b-99a7-db681b779076`.

All numeric IDs in the skill are shifted by one position:

| Stage | Skill says | Actual |
|-------|-----------|--------|
| Proposed | `4549842107` | `6f14f8f1-407b-4b5b-99a7-db681b779076` |
| Negotiation | `4549842108` | `4549842107` |
| Product Placed | `4549842109` | `4549842108` |
| Declined | `4549842110` | `4549842109` |
| Discontinued | (not listed) | `4549842110` |

## Impact

Any query that filters Product Pitches by stage will return wrong results. For example:

- Searching for pitches at "Proposed" using `4549842107` will actually return pitches at **Negotiation**
- The `pitch.update` test workflow moves a pitch to Negotiation using what it believes is the correct ID — if it uses the skill's mapping, it would set the wrong stage
- The `client-summary` skill uses Deal stage as primary status (working around this), but any future skill that queries Product Pitch stages directly will be affected
- The `hubspot-hygiene-check` skill checks Product Pitch stages against expected values — wrong mappings mean false positives or missed issues

## Root Cause

The Product Pitch pipeline uses a UUID for its first stage ("Proposed") and numeric IDs for subsequent stages. This is inconsistent with other pipelines in the system (Brand, Deal, Client Service all use numeric IDs throughout). The skill was likely authored by querying the pipeline API and assuming all stage IDs would be numeric, or the IDs were transcribed with an off-by-one error.

## Source

Discovered during the manual client summary exercise documented in `docs/plans/2026-03-27-client-summary-learnings.md` (see "Step 4: Fetch Product Pitches" and "Data Issues Discovered" section 3).

Live verification: all 69 MOJU Product Pitches are at stage `6f14f8f1-407b-4b5b-99a7-db681b779076`, which the skill would not match as "Proposed".

## Fix Required

Update `plugins/pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md`:

1. Replace the Product Pitch Pipeline stage listing with the correct IDs
2. Add a note that "Proposed" uses a UUID while other stages use numeric IDs
3. Verify no other stage mappings in the skill have similar off-by-one errors

## Related

- `plugins/pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md` — lines referencing Product Pitch pipeline stages
- `docs/plans/2026-03-27-client-summary-learnings.md` — original discovery
- `plugins/pluginbrands-toolkit/skills/client-summary/SKILL.md` — works around this by using Deal stage, but references Product Pitch stages
- `plugins/pluginbrands-toolkit/skills/hubspot-hygiene-check/SKILL.md` — checks Product Pitch stages
