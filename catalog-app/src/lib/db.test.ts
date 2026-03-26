import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// We test the schema initialization by importing and calling it
import { getDb, initSchema } from "./db";

const TEST_DB_PATH = path.join(__dirname, "../../data/test-catalog.db");

describe("database schema", () => {
  afterEach(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it("creates brands table with correct columns", () => {
    const db = new Database(TEST_DB_PATH);
    initSchema(db);

    const columns = db.pragma("table_info(brands)") as Array<{ name: string }>;
    const names = columns.map((c) => c.name);

    expect(names).toContain("id");
    expect(names).toContain("name");
    expect(names).toContain("description");
    expect(names).toContain("logo_path");
    expect(names).toContain("website");
    expect(names).toContain("country");
    expect(names).toContain("created_at");
    expect(names).toContain("updated_at");
    db.close();
  });

  it("creates products table with correct columns", () => {
    const db = new Database(TEST_DB_PATH);
    initSchema(db);

    const columns = db.pragma("table_info(products)") as Array<{
      name: string;
    }>;
    const names = columns.map((c) => c.name);

    expect(names).toContain("id");
    expect(names).toContain("brand_id");
    expect(names).toContain("name");
    expect(names).toContain("sku_code");
    expect(names).toContain("uk_rsp");
    expect(names).toContain("energy_kj_per_100");
    expect(names).toContain("ingredients");
    db.close();
  });

  it("creates product_images table with correct columns", () => {
    const db = new Database(TEST_DB_PATH);
    initSchema(db);

    const columns = db.pragma("table_info(product_images)") as Array<{
      name: string;
    }>;
    const names = columns.map((c) => c.name);

    expect(names).toContain("id");
    expect(names).toContain("product_id");
    expect(names).toContain("file_path");
    expect(names).toContain("image_type");
    expect(names).toContain("sort_order");
    db.close();
  });

  it("enforces foreign key from products to brands", () => {
    const db = new Database(TEST_DB_PATH);
    initSchema(db);
    db.pragma("foreign_keys = ON");

    expect(() => {
      db.prepare(
        "INSERT INTO products (brand_id, name) VALUES (999, 'orphan')"
      ).run();
    }).toThrow();
    db.close();
  });
});
