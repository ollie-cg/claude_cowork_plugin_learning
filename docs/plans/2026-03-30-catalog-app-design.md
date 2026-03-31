# Catalog App — Expand and Define

**Date:** 2026-03-30
**Status:** Approved
**Roadmap section:** 5

## Purpose and Scope

The catalog app is a product specification database that feeds the buyer deck skill. Its job is to hold accurate, up-to-date brand and product data — including images — so that Claude can generate buyer-facing decks without manual data gathering.

**In scope:**
- CRUD management for brands, products, and images (brand-level and product-level)
- Serves product data and images via API for the buyer deck skill
- Simple web UI for the PluginBrands team to maintain catalog data
- API key authentication for programmatic access
- Migration from SQLite to Postgres for durability

**Out of scope (architecturally possible later):**
- Client self-service portal (brands managing their own data)
- Sales performance dashboard (HubSpot pipeline data)
- Automated data ingestion from spec sheets (PDF/Excel)
- Deck generation (lives in the Claude skill, not the app)

**Hosting:** Single Next.js service on Railway, with Railway Postgres alongside it. Images remain on Railway persistent volume for now.

## Data Model Changes

### Brand-level images (new)

New `brand_images` table with the same structure as `product_images` but linked to a brand. Image types: `logo`, `hero`, `lifestyle`.

### HubSpot link (new)

Optional `hubspot_brand_id` column on the `brands` table. When set, the buyer deck skill uses it for exact matching instead of fragile case-insensitive name comparison against HubSpot's `client_name_sync`. Falls back to name matching when unset.

### Product fields

No schema changes. The 50+ fields stay in the database — they cost nothing to keep and removing them is destructive. The UI is reorganised to prioritise the 8 deck-critical fields (see UI section).

### Updated entity model

```
Brand
├── id, name, description, website, country
├── hubspot_brand_id (new, optional)
├── brand_images[] (new: logo, hero, lifestyle)
├── created_at, updated_at
└── products[]
    ├── id, name, sku_code, description, category, ...
    ├── product_images[] (hero, pack, lifestyle, nutritional)
    └── created_at, updated_at
```

### Image storage risk

Images remain on the Railway persistent volume. If the volume becomes unreliable or image counts grow large, migration to an object store (S3/R2) should be revisited. The image-serving API route (`/api/images/[...path]`) already abstracts the storage location, so swapping the backend later won't require API changes. **This is a known risk that needs monitoring.**

## Database Migration: SQLite to Postgres

The app has no real production data yet (seed/test only), so this is a fresh start on Postgres rather than a data migration.

### What changes

1. **Replace `better-sqlite3` with `pg`** (node-postgres). Keep raw SQL — the queries are simple CRUD and don't need an ORM.

2. **SQL syntax adjustments:**
   - `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
   - `datetime('now')` → `NOW()`
   - `?` placeholders → `$1, $2, $3` numbered parameters
   - `IFNULL` → `COALESCE`
   - Remove `PRAGMA` statements (WAL mode, foreign keys)

3. **Schema initialization:** Single migration file that creates all tables (including new `brand_images` table and `hubspot_brand_id` column) on first run.

4. **Seed data:** Re-run against Postgres.

5. **Railway setup:** Add a Postgres service to the Railway project. Railway provides `DATABASE_URL` automatically when linked. `db.ts` reads from `DATABASE_URL`.

6. **Remove `better-sqlite3`** from `package.json`. This also simplifies the Docker build — `better-sqlite3` requires native compilation which is fiddly in Alpine containers.

### What doesn't change

API routes, UI components, and image storage on the persistent volume are untouched by this migration.

## API Changes

### New endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/brands/[id]/images` | Upload image to a brand (multipart: file, image_type) |
| `DELETE` | `/api/brands/[id]/images/[imageId]` | Delete a brand image |

Brand images are served through the existing `/api/images/[...path]` route.

### Modified endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/brands` | Include brand images in response (logo URL at minimum) |
| `GET /api/brands/[id]` | Include full brand images array alongside products |
| `POST /api/brands` | Accept optional `hubspot_brand_id` |
| `PUT /api/brands/[id]` | Accept optional `hubspot_brand_id` |

### Removed endpoints

| Endpoint | Reason |
|----------|--------|
| `POST /api/decks/gamma` | Deck generation belongs in the Claude skill |

### Removed code

`gamma-client.ts`, `gamma-input.ts`, `deck-template.ts`, and associated tests. `GAMMA_API_KEY` env var no longer needed by the catalog app.

## API Key Authentication

Simple bearer token on all `/api/*` routes except image serving.

- Env var: `CATALOG_API_KEY` on Railway
- All `/api/*` routes check for `Authorization: Bearer <key>`
- Missing or wrong key → `401 Unauthorized`
- Exception: `GET /api/images/[...path]` is unauthenticated — image URLs are embedded directly in Gamma deck markdown and must be publicly accessible

Implementation: a `withAuth()` wrapper function called at the top of each API route handler.

The UI uses Next.js server components that call `queries.ts` directly (not through the API routes), so the team accesses the UI without login. The API key protects programmatic access only.

## UI Changes

### 1. Brand image gallery (new)

Add an image gallery section to the brand detail page (`/brands/[id]`), above the product table. Same drag-and-drop upload pattern as the product image gallery, with brand-specific types: logo, hero, lifestyle. The brand's logo shows on the brand card on the homepage.

### 2. Bulk image upload

Refactor the `image-upload.tsx` component to support multi-file selection:
- Accept multiple files in a single drop/selection
- Show a grid of thumbnails with a type dropdown on each
- One "Upload all" button to submit the batch

This handles the "bulk image dump" scenario — drop 10 images, tag each one, upload in one action.

### 3. Simplified product form

Reorganise the product form into two tiers:
- **Top section (always visible):** name, description, category, RSP, case size, wholesale cost, ingredients, images — the fields that drive deck generation
- **"Additional details" section (collapsed by default):** physical dimensions, nutritional info, pallet quantities, EAN codes, manufacturer details

## Skill Updates

The `generate-buyer-deck` skill needs two changes:
1. Send `Authorization: Bearer <CATALOG_API_KEY>` header when calling catalog API endpoints
2. Use `hubspot_brand_id` for brand matching when available, fall back to case-insensitive name matching

Add `CATALOG_API_KEY` as a required env var alongside `CATALOG_APP_URL` in the skill docs.

## Implementation Order

### Phase 1: Database (foundation) ✅ Complete (2026-03-30)
1. Set up Railway Postgres service and link to the app
2. Replace `better-sqlite3` with `pg`, rewrite `db.ts` connection setup
3. Create Postgres schema (existing tables + `brand_images` + `hubspot_brand_id`)
4. Rewrite `queries.ts` for Postgres syntax, add brand image CRUD functions
5. Update seed data for Postgres
6. Remove `better-sqlite3` from dependencies

### Phase 2: API changes ✅ Complete (2026-03-31)
7. Add `POST /api/brands/[id]/images` and `DELETE /api/brands/[id]/images/[imageId]`
8. Update brand endpoints to include brand images and accept `hubspot_brand_id`
9. Add `withAuth()` and apply to all API routes (except image serving and health)
10. Remove Gamma deck endpoint, `gamma-client.ts`, `gamma-input.ts`, `deck-template.ts`, and tests

Learnings: `docs/plans/2026-03-31-phase2-api-changes-learnings.md`

### Phase 3: UI changes
11. Add brand image gallery to brand detail page
12. Refactor `image-upload.tsx` for multi-file upload with per-image type tagging
13. Reorganise product form: deck-critical fields at top, rest collapsed

### Phase 4: Skill and config updates
14. Update `generate-buyer-deck` skill to send API key and use `hubspot_brand_id` matching
15. Update `catalog-app/README.md` with new env vars and removed Gamma dependency
16. Remove `GAMMA_API_KEY` from Railway env vars

## Future Directions (not designed, not committed)

- **Image storage migration** to S3/R2 when Railway volume becomes a concern
- **Client self-service portal** where brands log in and maintain their own catalog data
- **Sales performance dashboard** pulling HubSpot pipeline data alongside the product catalog
- **Automated spec sheet ingestion** parsing PDF/Excel spec sheets into catalog entries
