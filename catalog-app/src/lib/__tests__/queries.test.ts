import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db";
import { getProductsByIds } from "@/lib/queries";

describe("getProductsByIds", () => {
  let db: Database.Database;

  beforeAll(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    initSchema(db);

    db.prepare("INSERT INTO brands (id, name) VALUES (1, 'Test Brand')").run();
    db.prepare("INSERT INTO products (id, brand_id, name, uk_rsp, case_size) VALUES (1, 1, 'Product A', 6.95, 4)").run();
    db.prepare("INSERT INTO products (id, brand_id, name, uk_rsp, case_size) VALUES (2, 1, 'Product B', 7.50, 6)").run();
    db.prepare("INSERT INTO products (id, brand_id, name, uk_rsp, case_size) VALUES (3, 1, 'Product C', 5.00, 4)").run();
    db.prepare("INSERT INTO product_images (product_id, file_path, image_type, sort_order) VALUES (1, '1/1/hero.webp', 'hero', 0)").run();
    db.prepare("INSERT INTO product_images (product_id, file_path, image_type, sort_order) VALUES (1, '1/1/lifestyle.jpg', 'lifestyle', 1)").run();
    db.prepare("INSERT INTO product_images (product_id, file_path, image_type, sort_order) VALUES (2, '1/2/hero.webp', 'hero', 0)").run();
  });

  afterAll(() => db.close());

  it("returns products with images for given IDs", () => {
    const result = getProductsByIds(db, [1, 2]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Product A");
    expect(result[0].images).toHaveLength(2);
    expect(result[1].name).toBe("Product B");
    expect(result[1].images).toHaveLength(1);
  });

  it("returns empty array for no matching IDs", () => {
    const result = getProductsByIds(db, [999]);
    expect(result).toHaveLength(0);
  });

  it("preserves requested order", () => {
    const result = getProductsByIds(db, [2, 1]);
    expect(result[0].name).toBe("Product B");
    expect(result[1].name).toBe("Product A");
  });
});
