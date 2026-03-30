import { describe, it } from "vitest";
// TODO: Rewrite these tests for Postgres
// These tests were written for SQLite and need to be updated for async Postgres queries
import { getPool, schemaReady } from "@/lib/db";
import { getProductsByIds } from "@/lib/queries";

describe.skip("getProductsByIds", () => {
  it.skip("returns products with images for given IDs", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("returns empty array for no matching IDs", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("preserves requested order", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });
});
