# PluginBrands Toolkit — Roadmap

**Last updated:** 2026-03-31

This roadmap captures the full plan for delivering the PluginBrands plugin, from security fixes through to demo with Charlie.

---

## 1. Fix critical bugs

- ~~Fix Product Pitch "Proposed" stage ID in hubspot-api-query~~ ✅ Added explicit stage IDs to skill (2026-03-30)
- ~~Remove all ngrok/tunnel references from skills and catalog app — replace with live Railway URL~~ ✅ Deployed to Railway, replaced `TUNNEL_URL` with `CATALOG_APP_URL` (2026-03-30)
- ~~Align env vars: standardise on `CATALOG_APP_URL` across skills and app~~ ✅ Single env var everywhere (2026-03-30)
- ~~Fix broken link in hubspot-system-guide.md~~ ✅ Removed dangling reference to non-existent hubspot-connection.md (2026-03-30)
- **Upward loss cascade not implemented** — documented as automated but doesn't exist in HubSpot. All Product Pitches → Declined should cascade Brand → Lost → Deal → Lost, but nothing fires. Brand rollup fields (`closed_matching`, `products_placed`, `count_of_closed_products`) also broken — always 0. See `docs/issues/2026-03-30-upward-loss-cascade-not-implemented.md`. Needs either: (a) build the workflows + fix rollups in HubSpot admin, or (b) update docs to mark as manual operator step

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

This is a bigger project that needs its own planning. Current state: working CRUD app for brands, products, and images, deployed on Railway. Design doc approved: `docs/plans/2026-03-30-catalog-app-design.md`.

Phases:
- **Phase 1 (Database)** ✅ Postgres migration complete (2026-03-30). Brand images table and `hubspot_brand_id` column added.
- **Phase 2 (API changes)** ✅ Brand image endpoints, API key auth, Gamma removal complete (2026-03-31). See `docs/plans/2026-03-31-phase2-api-changes-learnings.md`.
- **Phase 3 (UI changes)** — Brand image gallery, bulk upload, simplified product form. Not started.
- **Phase 4 (Skill updates)** — Update buyer deck skill for API key auth and `hubspot_brand_id` matching. Not started.

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
- **Fix GitHub-based plugin installation** — Simon could not install the plugin from a GitHub link in Cowork; had to upload a zip file instead. Investigate what format/structure Cowork expects for GitHub-hosted plugins and fix accordingly. (Discovered 2026-03-31)
- Write plugin README and installation instructions
- End-to-end fresh install test (from GitHub link, not zip)

## 8. Build custom HubSpot MCP server

Added 2026-03-31 after Simon review. **Decision made: build a custom MCP server (Option B).** Design approved: `docs/plans/2026-03-31-custom-mcp-server-design.md`.

The official HubSpot MCP server doesn't support custom objects, which breaks most workflows. With 5-6 team members needing access via Cowork, we also need centralised auth and user attribution.

**Solution:** A standalone Node.js/TypeScript MCP server on Railway that:
- Holds the single HubSpot token (not on individual machines)
- Exposes 9 generic tools (search, get, create, update, batch read, associations, pipelines, owners)
- Authenticates each user via OAuth (Cowork's custom connector UI)
- Maps each user to their HubSpot owner ID so records show correct attribution
- Logs every action with user identity

**Implementation phases:**
1. Scaffold MCP server with OAuth + JWT auth (`mcp-server/` in this repo)
2. Build the 9 HubSpot proxy tools
3. Deploy to Railway, generate user credentials
4. Add Tier C to the test harness (MCP transport, same 13 test processes)
5. Update skills to reference MCP tools instead of curl recipes
6. Team onboarding — each person adds the connector in Cowork

## 9. Review with Simon

- ~~Walk Simon through the plugin capabilities~~ ✅ Done 2026-03-31
- Captured findings: GitHub install broken, token exposed, MCP custom objects not supported
- Have him re-test after fixes from Phases 0, 7, and 8
- Test the two core workflows (buyer deck, client summary) end-to-end

## 10. Demo to Charlie

- Prepare a demo script showing the key workflows
- Present the plugin and catalog app
- Gather feedback on direction
