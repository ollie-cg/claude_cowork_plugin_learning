# PluginBrands Toolkit — Roadmap

**Last updated:** 2026-03-30

This roadmap captures the full plan for delivering the PluginBrands plugin, from bug fixes through to demo with Charlie.

---

## 1. Fix critical bugs

- ~~Fix Product Pitch "Proposed" stage ID in hubspot-api-query~~ ✅ Added explicit stage IDs to skill (2026-03-30)
- ~~Remove all ngrok/tunnel references from skills and catalog app — replace with live Railway URL~~ ✅ Deployed to Railway, replaced `TUNNEL_URL` with `CATALOG_APP_URL` (2026-03-30)
- ~~Align env vars: standardise on `CATALOG_APP_URL` across skills and app~~ ✅ Single env var everywhere (2026-03-30)
- Fix broken link in hubspot-system-guide.md

## 2. Document the catalog app deployment ✅

Completed 2026-03-30. See `catalog-app/README.md` for production URL, deploy process, env vars, and API reference.

## 3. Fill skill gaps in hubspot-api-query

- Add Client Deal Pipeline (7 stages, IDs, creation recipe)
- Add Client Service lifecycle (16 stages, MRR/TCV, creation and association patterns)
- Add Client Product creation recipe and key fields
- Add Contact role-based associations (Reporting, Finance, Logistics, Admin)
- Add Lead pipelines (Buyer and Client) and lead creation patterns
- Remove hardcoded owner ID tables — replace with a dynamic lookup pattern

## 4. Clean up client summary skill

- Make it user-agnostic (no hardcoded owners, works for any PluginBrands team member)
- Decide on output format: text report vs. presentation (may need a routing step or separate modes)
- Test against multiple clients to validate accuracy
- Document expected output and known limitations

## 5. Catalog app — expand and define (own workstream)

This is a bigger project that needs its own planning. Current state: working CRUD app for brands, products, and images, deployed on Railway.

Needs definition:

- Define the full vision: what should the catalog do beyond what it does today?
- Product data completeness — how do products get into the catalog? Manual entry, HubSpot sync, CSV import?
- Image management workflow — how do images get uploaded, organised, and kept current?
- Integration with skills — how should the buyer deck and client summary skills pull from the catalog?
- UI/UX improvements for day-to-day use by the team
- Create a separate design doc and implementation plan for this workstream

## 6. Add test coverage (top 8 workflows)

These are the highest-value test workflows to add to the harness. See `docs/plans/2026-03-29-candidate-test-workflows.md` for the full list of 23 candidates.

### Read queries (highest value — the most common real use case)

- **`query.cross_entity`** — "Which buyers stock [brand]?" Multi-hop: Client Service → Deals → Brands → filter by name. Tests the core "answer questions about the CRM" capability.
- **`query.pipeline_report`** — "How many pitches at each stage for [client]?" Aggregation across Product Pitches grouped by stage. Tests counting and summarisation.
- **`query.contact_at_buyer`** — "Who's the contact at [won buyer]?" Navigate Deal → Company → Contact for a won deal. Tests the lookup pattern used before a call.

### Data quality (validates Claude catches known traps)

- **`quality.duplicate_brands`** — Query a client known to have duplicate Brand records, verify Claude flags them and deduplicates correctly.
- **`quality.stage_mismatch`** — Find cases where Deal is Won but Brand is stuck at an earlier stage. Verify Claude notices and reports the inconsistency.

### Client-side operations (currently zero coverage)

- **`client.deal_create`** — Create a Client Deal, progress through stages, verify the auto-created Client Service appears with correct associations.
- **`client.service_update`** — Update a Client Service's MRR, stage, and contract dates. Verify fields persist and stage history is recorded.

### Automation chain

- **`chain.cascading_loss`** — Progress a Deal to Lost, verify Brand cascades to Lost, Product Pitches cascade to Declined. The win path is tested; the loss path never has been.

### Prerequisites

- The test harness needs a read-only verification mode (current harness only tests writes)
- ~~The Product Pitch stage ID bug must be fixed first (step 1)~~ ✅

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
