# PluginBrands Toolkit — Roadmap

**Last updated:** 2026-03-30

This roadmap captures the full plan for delivering the PluginBrands plugin, from bug fixes through to demo with Charlie.

---

## 1. Fix critical bugs

- ~~Fix Product Pitch "Proposed" stage ID in hubspot-api-query~~ ✅ Added explicit stage IDs to skill (2026-03-30)
- ~~Remove all ngrok/tunnel references from skills and catalog app — replace with live Railway URL~~ ✅ Deployed to Railway, replaced `TUNNEL_URL` with `CATALOG_APP_URL` (2026-03-30)
- ~~Align env vars: standardise on `CATALOG_APP_URL` across skills and app~~ ✅ Single env var everywhere (2026-03-30)
- ~~Fix broken link in hubspot-system-guide.md~~ ✅ Removed dangling reference to non-existent hubspot-connection.md (2026-03-30)

## 2. Document the catalog app deployment ✅

Completed 2026-03-30. See `catalog-app/README.md` for production URL, deploy process, env vars, and API reference.

## 3. Fill skill gaps in hubspot-api-query

Investigation complete (2026-03-30) — all stage IDs, properties, and association types queried from live HubSpot. Partial update to SKILL.md in progress.

- ~~Investigate Client Deal Pipeline~~ ✅ 7 stages, all IDs captured (Discovery `3774636253` through Closed Lost `3774636259`)
- ~~Investigate Client Service lifecycle~~ ✅ 16 stages, all IDs captured. Key fields: `mrr`, `total_customer_value`, `hs_category`, `original_start_date`, `agreed_leave_date`
- ~~Investigate Client Product~~ ✅ 2-stage pipeline, 67+ fields. Name field is `hs_course_name`. Associates to Client Service via type `1139`
- ~~Investigate Contact role-based associations~~ ✅ Administration (6), Logistics (2), Reporting (4), Finance (8)
- ~~Investigate Lead pipelines~~ ✅ Buyer Lead Pipeline (`2761663691`) and Client Lead Pipeline both found. 16 buyer leads, 1 client lead in system
- ~~Investigate dynamic owner lookup~~ ✅ `GET /crm/v3/owners?limit=100` returns full list — no hardcoded tables needed
- **Still to do:** Write all findings into SKILL.md (pipeline stage tables started, creation recipes and field reference not yet written)

## 4. Clean up client summary skill

- ~~Make it user-agnostic (no hardcoded owners, works for any PluginBrands team member)~~ ✅ Replaced hardcoded owner table with dynamic `GET /crm/v3/owners` lookup (2026-03-30)
- ~~Decide on output format~~ ✅ Three modes: terminal (default), email, and deck (2026-03-30)
  - Terminal and email are implemented in the skill
  - **Deck output is not yet implemented** — skill tells the user it's on the roadmap and offers alternatives
- ~~Test against multiple clients to validate accuracy~~ ✅ Tested with MOJU, Valeo - Kettle, Who Gives a Crap, and Goodrays (2026-03-30). Deduplication works across all. Key findings: product counts zero for Kettle, orphaned itsu deal shared across clients, activity sparse everywhere.

## 5. Catalog app — expand and define (own workstream)

This is a bigger project that needs its own planning. Current state: working CRUD app for brands, products, and images, deployed on Railway.

Needs definition:

- Define the full vision: what should the catalog do beyond what it does today?
- Product data completeness — how do products get into the catalog? Manual entry, HubSpot sync, CSV import?
- Image management workflow — how do images get uploaded, organised, and kept current?
- Integration with skills — how should the buyer deck and client summary skills pull from the catalog?
- UI/UX improvements for day-to-day use by the team
- Create a separate design doc and implementation plan for this workstream

## 6. Add test coverage

8 new test processes implemented (2026-03-30). Total coverage: 5 existing + 8 new = **13 processes**. See `docs/plans/2026-03-30-test-coverage-expansion-design.md` for the full design. See `docs/plans/2026-03-29-candidate-test-workflows.md` for the wider list of 23 candidates.

### Implemented — awaiting first Tier A + Tier B run

Client operations (zero coverage → 5 tests):
- ~~`client.onboard`~~ ✅ Company, contact, Client Deal at Discovery with `amount`, `length_of_contract__months_`, `customer_profile`
- ~~`client.deal_close_lost`~~ ✅ Client Deal moved to Closed Lost via Negotiation
- ~~`client.service_update`~~ ✅ Create Client Service with `mrr`, `hs_category`, `original_start_date`
- ~~`client.pipeline_progression`~~ ✅ Client Deal through all 6 open stages to Closed Won, chronological timestamp check
- ~~`client.product_create`~~ ✅ Client Product (`0-410`) with commercial fields, associated to MOJU Client Service

Contact associations:
- ~~`contact.role_associations`~~ ✅ Contact with Reporting (4) and Finance (8) roles on MOJU Client Service

Automation chain / loss path:
- ~~`chain.product_pitch_creation`~~ ✅ Brand auto-creation → Proposal → Product Pitch auto-creation, verify stage and `client_name_sync`
- ~~`chain.cascading_loss`~~ ✅ All pitches → Declined → Brand → Lost → Deal → Lost (6 verification actions)

Harness changes:
- Added `0-162` and `0-410` to fallback teardown `search_field_map` and pre-tier cleanup sweep

**Next: run all 13 processes under Tier A and Tier B to get baseline results.**

### Not yet implemented — needs harness changes

Read queries (need read-only verification mode):
- `query.cross_entity` — "Which buyers stock [brand]?"
- `query.pipeline_report` — "How many pitches at each stage for [client]?"
- `query.contact_at_buyer` — "Who's the contact at [won buyer]?"

Data quality (need qualitative verification):
- `quality.duplicate_brands` — Flag and deduplicate Brand duplicates
- `quality.stage_mismatch` — Flag Deal Won but Brand stuck at earlier stage

## 7. Package as plugin

- Finalise plugin structure and metadata
- Ensure all skills work in both Claude Code and Cowork (transport-agnostic refactor)
- Write plugin README and installation instructions
- End-to-end fresh install test

## 8. Review with Simon

- Walk Simon through the plugin capabilities
- Have him test the two core workflows (buyer deck, client summary)
- Gather feedback and iterate

## 9. Demo to Charlie

- Prepare a demo script showing the key workflows
- Present the plugin and catalog app
- Gather feedback on direction
