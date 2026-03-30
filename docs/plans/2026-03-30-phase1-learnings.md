# Phase 1 Learnings — SQLite to Postgres Migration

**Date:** 2026-03-30
**Plan:** docs/plans/2026-03-30-catalog-app-design.md (Phase 1)

## What was done

Migrated the catalog app database layer from SQLite (better-sqlite3) to Postgres (pg/node-postgres). Five commits:

| Commit | Summary |
|--------|---------|
| `9aac2af` | Replace better-sqlite3 with pg, rewrite db.ts with Pool + schema |
| `3287325` | Add BrandImage type, hubspot_brand_id to Brand |
| `2f9c9bf` | Rewrite queries.ts for Postgres syntax + brand image CRUD |
| `4375455` | Migrate all API routes and pages to async queries |
| `c9318eb` | Update seed.ts and stub tests for Postgres |

## Key decisions and patterns

### Pool singleton with schemaReady() promise

`getPool()` returns the Pool synchronously (safe to call anywhere), but schema DDL runs async in the background. Callers do `await schemaReady()` before their first query. If schema init fails, the catch handler resets both `_pool` and `_schemaReady` to null so the next call retries.

### RETURNING * instead of INSERT + SELECT

Postgres supports `INSERT ... RETURNING *` which eliminates the SQLite pattern of inserting then doing a separate SELECT to get the created row. Cleaner and one fewer round-trip.

### Column name allow-list for dynamic queries

`createProduct` and `updateProduct` accept arbitrary keys from the request body and interpolate them as column names. The values are parameterized ($1, $2...) but column names can't be parameterized. Added a `PRODUCT_COLUMNS` Set to filter keys, preventing SQL injection via crafted key names.

### Postgres COUNT returns bigint as string

`COUNT(*)` in Postgres returns `bigint`, which node-postgres serializes as a string. Added `::int` cast in the `getAllBrands` query so `product_count` arrives as a number matching the TypeScript type.

### Tests stubbed, not ported

The SQLite tests used in-memory databases which don't have a Postgres equivalent without extra tooling (pg-mem, testcontainers, or a real test DB). Tests are stubbed with `describe.skip` and TODO comments. Implementing proper Postgres integration tests is a follow-up task.

## What went well

- The sync-to-async conversion was straightforward since Next.js API routes and server components are already async
- `RETURNING *` simplified the query layer significantly
- No schema changes were needed for existing tables beyond syntax conversion
- TypeScript caught all broken call sites immediately after changing the function signatures

## Issues caught in review

1. **Async race condition** — initial db.ts called `initSchema()` without await. Fixed with `schemaReady()` promise pattern.
2. **SQL injection via dynamic columns** — inherited from SQLite version. Fixed with allow-list.
3. **@types/pg in dependencies** — moved to devDependencies.
4. **Postgres bigint serialization** — COUNT(*) returns string. Fixed with `::int` cast.
5. **Sequential queries in getBrandById** — products and brand_images fetches were sequential but independent. Fixed with `Promise.all`.

## Remaining work for Phase 1

- **Railway Postgres setup** — provision the Postgres service on Railway, link to the app, set DATABASE_URL
- **Postgres integration tests** — implement the stubbed tests (needs test database strategy)

## Dependencies for Phase 2

Phase 2 (API changes) can proceed immediately. The new brand image CRUD functions and hubspot_brand_id support are already in queries.ts and the brand API routes accept hubspot_brand_id.
