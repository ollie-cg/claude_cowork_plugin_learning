import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initSchema } from "./db";
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

const TEST_DB_PATH = path.join(__dirname, "../../data/test-queries.db");

function makeTestDb(): Database.Database {
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

describe("brand queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeTestDb();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it("createBrand inserts and returns a brand with id", () => {
    const brand = createBrand(db, { name: "MOJU", description: "Shots brand", logo_path: null, website: "https://moju.com", country: "UK" });
    expect(brand.id).toBeGreaterThan(0);
    expect(brand.name).toBe("MOJU");
  });

  it("getAllBrands returns brands with product counts", () => {
    createBrand(db, { name: "MOJU", description: null, logo_path: null, website: null, country: null });
    const brand2 = createBrand(db, { name: "Love Corn", description: null, logo_path: null, website: null, country: null });
    createProduct(db, { brand_id: brand2.id, name: "Sea Salt 45g" });

    const brands = getAllBrands(db);
    expect(brands).toHaveLength(2);

    const loveCorn = brands.find((b) => b.name === "Love Corn");
    expect(loveCorn?.product_count).toBe(1);

    const moju = brands.find((b) => b.name === "MOJU");
    expect(moju?.product_count).toBe(0);
  });

  it("getBrandById returns brand with products array", () => {
    const brand = createBrand(db, { name: "MOJU", description: "Shots", logo_path: null, website: null, country: null });
    createProduct(db, { brand_id: brand.id, name: "Ginger Shot" });
    createProduct(db, { brand_id: brand.id, name: "Turmeric Shot" });

    const detail = getBrandById(db, brand.id);
    expect(detail).not.toBeNull();
    expect(detail!.products).toHaveLength(2);
  });

  it("getBrandById returns null for missing id", () => {
    expect(getBrandById(db, 999)).toBeNull();
  });

  it("updateBrand updates fields and updated_at", () => {
    const brand = createBrand(db, { name: "MOJU", description: null, logo_path: null, website: null, country: null });
    const updated = updateBrand(db, brand.id, { name: "MOJU Drinks", description: "Updated", logo_path: null, website: null, country: null });
    expect(updated?.name).toBe("MOJU Drinks");
    expect(updated?.description).toBe("Updated");
  });

  it("deleteBrand removes brand and cascades to products", () => {
    const brand = createBrand(db, { name: "MOJU", description: null, logo_path: null, website: null, country: null });
    createProduct(db, { brand_id: brand.id, name: "Ginger Shot" });

    deleteBrand(db, brand.id);
    expect(getBrandById(db, brand.id)).toBeNull();

    const products = getProductsByBrand(db, brand.id);
    expect(products).toHaveLength(0);
  });
});

describe("product queries", () => {
  let db: Database.Database;
  let brandId: number;

  beforeEach(() => {
    db = makeTestDb();
    const brand = createBrand(db, { name: "MOJU", description: null, logo_path: null, website: null, country: null });
    brandId = brand.id;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it("createProduct inserts and returns product", () => {
    const product = createProduct(db, { brand_id: brandId, name: "Ginger Shot 60ml", sku_code: "MOJU-GS60", uk_rsp: 1.80 });
    expect(product.id).toBeGreaterThan(0);
    expect(product.name).toBe("Ginger Shot 60ml");
    expect(product.sku_code).toBe("MOJU-GS60");
  });

  it("getProductById returns product with images and brand_name", () => {
    const product = createProduct(db, { brand_id: brandId, name: "Ginger Shot" });
    createProductImage(db, { product_id: product.id, file_path: "moju/ginger-hero.jpg", image_type: "hero", sort_order: 0 });

    const detail = getProductById(db, product.id);
    expect(detail).not.toBeNull();
    expect(detail!.brand_name).toBe("MOJU");
    expect(detail!.images).toHaveLength(1);
    expect(detail!.images[0].image_type).toBe("hero");
  });

  it("updateProduct updates fields", () => {
    const product = createProduct(db, { brand_id: brandId, name: "Ginger Shot" });
    const updated = updateProduct(db, product.id, { brand_id: brandId, name: "Ginger Shot 60ml", uk_rsp: 1.80 });
    expect(updated?.name).toBe("Ginger Shot 60ml");
    expect(updated?.uk_rsp).toBe(1.80);
  });

  it("deleteProduct removes product", () => {
    const product = createProduct(db, { brand_id: brandId, name: "Ginger Shot" });
    deleteProduct(db, product.id);
    expect(getProductById(db, product.id)).toBeNull();
  });
});

describe("product image queries", () => {
  let db: Database.Database;
  let productId: number;

  beforeEach(() => {
    db = makeTestDb();
    const brand = createBrand(db, { name: "MOJU", description: null, logo_path: null, website: null, country: null });
    const product = createProduct(db, { brand_id: brand.id, name: "Ginger Shot" });
    productId = product.id;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it("createProductImage inserts and returns image record", () => {
    const img = createProductImage(db, { product_id: productId, file_path: "moju/ginger.jpg", image_type: "hero", sort_order: 0 });
    expect(img.id).toBeGreaterThan(0);
    expect(img.file_path).toBe("moju/ginger.jpg");
  });

  it("getImagesByProduct returns images ordered by sort_order", () => {
    createProductImage(db, { product_id: productId, file_path: "b.jpg", image_type: "pack", sort_order: 2 });
    createProductImage(db, { product_id: productId, file_path: "a.jpg", image_type: "hero", sort_order: 1 });

    const images = getImagesByProduct(db, productId);
    expect(images).toHaveLength(2);
    expect(images[0].file_path).toBe("a.jpg");
    expect(images[1].file_path).toBe("b.jpg");
  });

  it("deleteProductImage removes single image", () => {
    const img = createProductImage(db, { product_id: productId, file_path: "x.jpg", image_type: "hero", sort_order: 0 });
    deleteProductImage(db, img.id);
    expect(getImagesByProduct(db, productId)).toHaveLength(0);
  });
});
