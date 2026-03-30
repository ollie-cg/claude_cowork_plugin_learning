import { describe, it } from "vitest";
// TODO: Rewrite these tests for Postgres
// These tests were written for SQLite and need to be updated for async Postgres queries
import { getPool, schemaReady } from "./db";
import {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
  getProductsByBrand,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductImage,
  getImagesByProduct,
  deleteProductImage,
} from "./queries";

describe.skip("brand queries", () => {
  it.skip("createBrand inserts and returns a brand with id", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("getAllBrands returns brands with product counts", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("getBrandById returns brand with products array", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("updateBrand updates fields and returns updated brand", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("deleteBrand removes brand (and cascades to products)", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });
});

describe.skip("product queries", () => {
  it.skip("createProduct inserts and returns a product with id", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("getProductById returns product with brand_name and images", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("updateProduct updates fields", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("deleteProduct removes product (and cascades to images)", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });
});

describe.skip("product image queries", () => {
  it.skip("createProductImage inserts and returns an image", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("getImagesByProduct returns images in sort_order", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });

  it.skip("deleteProductImage removes an image", async () => {
    // TODO: Implement with Postgres test database
    await schemaReady();
    const pool = getPool();
  });
});
