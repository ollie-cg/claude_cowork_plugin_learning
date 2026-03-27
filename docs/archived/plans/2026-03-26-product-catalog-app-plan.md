# Product Catalog App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Next.js product catalog app with SQLite storage, brand/product CRUD, image management, and API endpoints for Claude skills.

**Architecture:** Next.js App Router with server components for pages and API routes backed by SQLite via better-sqlite3. Images stored on local filesystem under `data/images/`. shadcn/ui for all UI components. No auth — internal tool.

**Tech Stack:** Next.js 15 (App Router), TypeScript, better-sqlite3, shadcn/ui, Tailwind CSS, Vitest

**Design doc:** `docs/plans/2026-03-26-product-catalog-app-design.md`

---

## Task 1: Scaffold Next.js Project

**Files:**
- Create: `catalog-app/` (entire scaffold)

**Step 1: Create the Next.js app**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning
npx create-next-app@latest catalog-app --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
```

Accept defaults. This creates the full Next.js scaffold with App Router, TypeScript, and Tailwind.

**Step 2: Install dependencies**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm install better-sqlite3
npm install -D @types/better-sqlite3 vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

**Step 3: Create data directories**

```bash
mkdir -p /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app/data/images
```

**Step 4: Add vitest config**

Create: `catalog-app/vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**Step 5: Add test script to package.json**

In `catalog-app/package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 6: Add data/ to .gitignore**

Append to `catalog-app/.gitignore`:

```
data/catalog.db
data/images/*
!data/images/.gitkeep
```

Create `catalog-app/data/images/.gitkeep` (empty file).

**Step 7: Verify scaffold works**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm run build
```

Expected: Build succeeds.

**Step 8: Commit**

```bash
git add catalog-app/
git commit -m "feat: scaffold Next.js catalog app with dependencies"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `catalog-app/src/types/index.ts`

**Step 1: Write type definitions**

Create: `catalog-app/src/types/index.ts`

```typescript
export interface Brand {
  id: number;
  name: string;
  description: string | null;
  logo_path: string | null;
  website: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandWithCount extends Brand {
  product_count: number;
}

export interface Product {
  id: number;
  brand_id: number;
  name: string;
  sku_code: string | null;
  ean: string | null;
  case_ean: string | null;
  description: string | null;
  category: string | null;
  category_detail: string | null;
  uk_rsp: number | null;
  wholesale_case_cost: number | null;
  case_size: number | null;
  vat_percent: number | null;
  unit_depth_mm: number | null;
  unit_width_mm: number | null;
  unit_height_mm: number | null;
  unit_net_weight_g: number | null;
  unit_gross_weight_g: number | null;
  case_depth_mm: number | null;
  case_width_mm: number | null;
  case_height_mm: number | null;
  pallet_qty: number | null;
  layer_qty: number | null;
  energy_kj_per_100: string | null;
  energy_kcal_per_100: string | null;
  fat_per_100: string | null;
  saturates_per_100: string | null;
  carbs_per_100: string | null;
  sugars_per_100: string | null;
  fibre_per_100: string | null;
  protein_per_100: string | null;
  salt_per_100: string | null;
  energy_kj_per_serving: string | null;
  energy_kcal_per_serving: string | null;
  fat_per_serving: string | null;
  saturates_per_serving: string | null;
  carbs_per_serving: string | null;
  sugars_per_serving: string | null;
  fibre_per_serving: string | null;
  protein_per_serving: string | null;
  salt_per_serving: string | null;
  serving_type: string | null;
  ingredients: string | null;
  allergens: string | null;
  country_of_origin: string | null;
  manufacturer_name: string | null;
  manufacturer_address: string | null;
  shelf_life_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: number;
  product_id: number;
  file_path: string;
  image_type: "hero" | "pack" | "lifestyle" | "nutritional" | null;
  sort_order: number | null;
  created_at: string;
}

export interface ProductWithImages extends Product {
  images: ProductImage[];
  brand_name?: string;
}

export interface BrandDetail extends Brand {
  products: Product[];
}

export type BrandInput = Omit<Brand, "id" | "created_at" | "updated_at">;
export type ProductInput = Omit<Product, "id" | "created_at" | "updated_at">;
```

**Step 2: Commit**

```bash
git add catalog-app/src/types/
git commit -m "feat: add TypeScript type definitions for catalog data model"
```

---

## Task 3: SQLite Database Layer

**Files:**
- Create: `catalog-app/src/lib/db.ts`
- Create: `catalog-app/src/lib/db.test.ts`

**Step 1: Write the failing test**

Create: `catalog-app/src/lib/db.test.ts`

```typescript
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
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npx vitest run src/lib/db.test.ts
```

Expected: FAIL — `./db` module doesn't exist.

**Step 3: Write the database module**

Create: `catalog-app/src/lib/db.ts`

```typescript
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "catalog.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      logo_path TEXT,
      website TEXT,
      country TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sku_code TEXT,
      ean TEXT,
      case_ean TEXT,
      description TEXT,
      category TEXT,
      category_detail TEXT,
      uk_rsp REAL,
      wholesale_case_cost REAL,
      case_size INTEGER,
      vat_percent REAL,
      unit_depth_mm REAL,
      unit_width_mm REAL,
      unit_height_mm REAL,
      unit_net_weight_g REAL,
      unit_gross_weight_g REAL,
      case_depth_mm REAL,
      case_width_mm REAL,
      case_height_mm REAL,
      pallet_qty INTEGER,
      layer_qty INTEGER,
      energy_kj_per_100 TEXT,
      energy_kcal_per_100 TEXT,
      fat_per_100 TEXT,
      saturates_per_100 TEXT,
      carbs_per_100 TEXT,
      sugars_per_100 TEXT,
      fibre_per_100 TEXT,
      protein_per_100 TEXT,
      salt_per_100 TEXT,
      energy_kj_per_serving TEXT,
      energy_kcal_per_serving TEXT,
      fat_per_serving TEXT,
      saturates_per_serving TEXT,
      carbs_per_serving TEXT,
      sugars_per_serving TEXT,
      fibre_per_serving TEXT,
      protein_per_serving TEXT,
      salt_per_serving TEXT,
      serving_type TEXT,
      ingredients TEXT,
      allergens TEXT,
      country_of_origin TEXT,
      manufacturer_name TEXT,
      manufacturer_address TEXT,
      shelf_life_days INTEGER,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      image_type TEXT CHECK(image_type IN ('hero', 'pack', 'lifestyle', 'nutritional')),
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npx vitest run src/lib/db.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add catalog-app/src/lib/db.ts catalog-app/src/lib/db.test.ts
git commit -m "feat: add SQLite database layer with schema initialization"
```

---

## Task 4: Database Query Functions

**Files:**
- Create: `catalog-app/src/lib/queries.ts`
- Create: `catalog-app/src/lib/queries.test.ts`

**Step 1: Write failing tests for brand queries**

Create: `catalog-app/src/lib/queries.test.ts`

```typescript
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
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npx vitest run src/lib/queries.test.ts
```

Expected: FAIL — `./queries` module doesn't exist.

**Step 3: Write the queries module**

Create: `catalog-app/src/lib/queries.ts`

```typescript
import Database from "better-sqlite3";
import type { Brand, BrandWithCount, BrandDetail, BrandInput, Product, ProductWithImages, ProductInput, ProductImage } from "@/types";

// --- Brands ---

export function getAllBrands(db: Database.Database): BrandWithCount[] {
  return db.prepare(`
    SELECT b.*, COALESCE(cnt, 0) AS product_count
    FROM brands b
    LEFT JOIN (SELECT brand_id, COUNT(*) AS cnt FROM products GROUP BY brand_id) p
      ON p.brand_id = b.id
    ORDER BY b.name
  `).all() as BrandWithCount[];
}

export function getBrandById(db: Database.Database, id: number): BrandDetail | null {
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(id) as Brand | undefined;
  if (!brand) return null;

  const products = db.prepare("SELECT * FROM products WHERE brand_id = ? ORDER BY name").all(id) as Product[];
  return { ...brand, products };
}

export function createBrand(db: Database.Database, input: BrandInput): Brand {
  const result = db.prepare(`
    INSERT INTO brands (name, description, logo_path, website, country)
    VALUES (@name, @description, @logo_path, @website, @country)
  `).run(input);

  return db.prepare("SELECT * FROM brands WHERE id = ?").get(result.lastInsertRowid) as Brand;
}

export function updateBrand(db: Database.Database, id: number, input: BrandInput): Brand | null {
  db.prepare(`
    UPDATE brands SET name = @name, description = @description, logo_path = @logo_path,
      website = @website, country = @country, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });

  return db.prepare("SELECT * FROM brands WHERE id = ?").get(id) as Brand | undefined ?? null;
}

export function deleteBrand(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM brands WHERE id = ?").run(id);
}

// --- Products ---

export function getProductsByBrand(db: Database.Database, brandId: number): Product[] {
  return db.prepare("SELECT * FROM products WHERE brand_id = ? ORDER BY name").all(brandId) as Product[];
}

export function getProductById(db: Database.Database, id: number): ProductWithImages | null {
  const product = db.prepare(`
    SELECT p.*, b.name AS brand_name
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id = ?
  `).get(id) as (Product & { brand_name: string }) | undefined;

  if (!product) return null;

  const images = db.prepare(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order"
  ).all(id) as ProductImage[];

  return { ...product, images };
}

export function createProduct(db: Database.Database, input: Partial<ProductInput> & { brand_id: number; name: string }): Product {
  const columns = Object.keys(input);
  const placeholders = columns.map((c) => `@${c}`);

  const result = db.prepare(`
    INSERT INTO products (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
  `).run(input);

  return db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid) as Product;
}

export function updateProduct(db: Database.Database, id: number, input: Partial<ProductInput> & { brand_id: number; name: string }): Product | null {
  const sets = Object.keys(input).map((c) => `${c} = @${c}`);
  sets.push("updated_at = datetime('now')");

  db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = @id`).run({ ...input, id });

  return db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined ?? null;
}

export function deleteProduct(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

// --- Product Images ---

export function createProductImage(
  db: Database.Database,
  input: { product_id: number; file_path: string; image_type: string | null; sort_order: number | null }
): ProductImage {
  const result = db.prepare(`
    INSERT INTO product_images (product_id, file_path, image_type, sort_order)
    VALUES (@product_id, @file_path, @image_type, @sort_order)
  `).run(input);

  return db.prepare("SELECT * FROM product_images WHERE id = ?").get(result.lastInsertRowid) as ProductImage;
}

export function getImagesByProduct(db: Database.Database, productId: number): ProductImage[] {
  return db.prepare(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order"
  ).all(productId) as ProductImage[];
}

export function deleteProductImage(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM product_images WHERE id = ?").run(id);
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npx vitest run src/lib/queries.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add catalog-app/src/lib/queries.ts catalog-app/src/lib/queries.test.ts
git commit -m "feat: add database query functions for brands, products, and images"
```

---

## Task 5: Brand API Routes

**Files:**
- Create: `catalog-app/src/app/api/brands/route.ts`
- Create: `catalog-app/src/app/api/brands/[id]/route.ts`

**Step 1: Create brands list/create route**

Create: `catalog-app/src/app/api/brands/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAllBrands, createBrand } from "@/lib/queries";

export async function GET() {
  const db = getDb();
  const brands = getAllBrands(db);
  return NextResponse.json(brands);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const brand = createBrand(db, {
    name: body.name.trim(),
    description: body.description ?? null,
    logo_path: body.logo_path ?? null,
    website: body.website ?? null,
    country: body.country ?? null,
  });

  return NextResponse.json(brand, { status: 201 });
}
```

**Step 2: Create brand detail/update/delete route**

Create: `catalog-app/src/app/api/brands/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBrandById, updateBrand, deleteBrand } from "@/lib/queries";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const brand = getBrandById(db, Number(id));

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  return NextResponse.json(brand);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const brand = updateBrand(db, Number(id), {
    name: body.name.trim(),
    description: body.description ?? null,
    logo_path: body.logo_path ?? null,
    website: body.website ?? null,
    country: body.country ?? null,
  });

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  return NextResponse.json(brand);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  deleteBrand(db, Number(id));
  return new NextResponse(null, { status: 204 });
}
```

**Step 3: Verify build compiles**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npx tsc --noEmit
```

Expected: No type errors.

**Step 4: Commit**

```bash
git add catalog-app/src/app/api/brands/
git commit -m "feat: add brand API routes (list, detail, create, update, delete)"
```

---

## Task 6: Product API Routes

**Files:**
- Create: `catalog-app/src/app/api/products/route.ts`
- Create: `catalog-app/src/app/api/products/[id]/route.ts`
- Create: `catalog-app/src/app/api/products/[id]/images/route.ts`
- Create: `catalog-app/src/app/api/images/[...path]/route.ts`

**Step 1: Create product create route**

Create: `catalog-app/src/app/api/products/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createProduct } from "@/lib/queries";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.brand_id || !body.name?.trim()) {
    return NextResponse.json({ error: "brand_id and name are required" }, { status: 400 });
  }

  const db = getDb();
  const product = createProduct(db, { ...body, name: body.name.trim() });
  return NextResponse.json(product, { status: 201 });
}
```

**Step 2: Create product detail/update/delete route**

Create: `catalog-app/src/app/api/products/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getProductById, updateProduct, deleteProduct } from "@/lib/queries";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const product = getProductById(db, Number(id));

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Build absolute image URLs
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const withUrls = {
    ...product,
    images: product.images.map((img) => ({
      ...img,
      url: `${baseUrl}/api/images/${img.file_path}`,
    })),
  };

  return NextResponse.json(withUrls);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  if (!body.brand_id || !body.name?.trim()) {
    return NextResponse.json({ error: "brand_id and name are required" }, { status: 400 });
  }

  const db = getDb();
  const product = updateProduct(db, Number(id), { ...body, name: body.name.trim() });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  deleteProduct(db, Number(id));
  return new NextResponse(null, { status: 204 });
}
```

**Step 3: Create image upload route**

Create: `catalog-app/src/app/api/products/[id]/images/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createProductImage, getImagesByProduct, getProductById } from "@/lib/queries";
import fs from "fs";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const images = getImagesByProduct(db, Number(id));
  return NextResponse.json(images);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  const db = getDb();

  const product = getProductById(db, productId);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const imageType = (formData.get("image_type") as string) || null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Save file: data/images/<brandId>/<productId>/<filename>
  const subDir = path.join(String(product.brand_id), String(productId));
  const dirPath = path.join(IMAGES_DIR, subDir);
  fs.mkdirSync(dirPath, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(subDir, safeName);
  const fullPath = path.join(IMAGES_DIR, filePath);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);

  const image = createProductImage(db, {
    product_id: productId,
    file_path: filePath,
    image_type: imageType,
    sort_order: sortOrder,
  });

  return NextResponse.json(image, { status: 201 });
}
```

**Step 4: Create image serve route**

Create: `catalog-app/src/app/api/images/[...path]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const filePath = path.join(IMAGES_DIR, ...segments);

  // Prevent directory traversal
  if (!filePath.startsWith(IMAGES_DIR)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

**Step 5: Verify build compiles**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add catalog-app/src/app/api/products/ catalog-app/src/app/api/images/
git commit -m "feat: add product CRUD, image upload, and image serve API routes"
```

---

## Task 7: Install shadcn/ui and Base Components

**Files:**
- Modify: `catalog-app/` (shadcn init + component installs)

**Step 1: Initialize shadcn/ui**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npx shadcn@latest init -d
```

This sets up the shadcn config. Accept defaults (New York style, Zinc color).

**Step 2: Install required shadcn components**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npx shadcn@latest add button card input label table dialog textarea select collapsible badge
```

**Step 3: Commit**

```bash
git add catalog-app/
git commit -m "feat: initialize shadcn/ui and install base components"
```

---

## Task 8: Brands List Page (Home)

**Files:**
- Create: `catalog-app/src/components/brand-card.tsx`
- Modify: `catalog-app/src/app/page.tsx`
- Create: `catalog-app/src/app/brands/new/page.tsx`
- Modify: `catalog-app/src/app/layout.tsx`

**Step 1: Create brand card component**

Create: `catalog-app/src/components/brand-card.tsx`

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BrandWithCount } from "@/types";

export function BrandCard({ brand }: { brand: BrandWithCount }) {
  return (
    <Link href={`/brands/${brand.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{brand.name}</CardTitle>
            <Badge variant="secondary">{brand.product_count} products</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {brand.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{brand.description}</p>
          )}
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            {brand.country && <span>{brand.country}</span>}
            {brand.website && <span>{brand.website}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**Step 2: Update the home page**

Replace contents of `catalog-app/src/app/page.tsx`:

```tsx
import { getDb } from "@/lib/db";
import { getAllBrands } from "@/lib/queries";
import { BrandCard } from "@/components/brand-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HomePage() {
  const db = getDb();
  const brands = getAllBrands(db);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Product Catalog</h1>
        <Link href="/brands/new">
          <Button>Add Brand</Button>
        </Link>
      </div>

      {brands.length === 0 ? (
        <p className="text-muted-foreground">No brands yet. Add one to get started.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Update layout with app title**

Modify `catalog-app/src/app/layout.tsx` — update the metadata title to "Product Catalog" and ensure the body has a clean base style. Keep the existing structure, just update the metadata.

**Step 4: Create add brand page**

Create: `catalog-app/src/app/brands/new/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewBrandPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name"),
      description: form.get("description") || null,
      website: form.get("website") || null,
      country: form.get("country") || null,
    };

    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const brand = await res.json();
      router.push(`/brands/${brand.id}`);
    } else {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Add Brand</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Brand Name *</Label>
          <Input id="name" name="name" required />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} />
        </div>
        <div>
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" type="url" placeholder="https://" />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Create Brand"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
```

**Step 5: Verify build**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm run build
```

**Step 6: Commit**

```bash
git add catalog-app/src/
git commit -m "feat: add brands list home page and add-brand form"
```

---

## Task 9: Brand Detail Page

**Files:**
- Create: `catalog-app/src/components/product-table.tsx`
- Create: `catalog-app/src/app/brands/[id]/page.tsx`

**Step 1: Create product table component**

Create: `catalog-app/src/components/product-table.tsx`

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Product } from "@/types";

export function ProductTable({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return <p className="text-muted-foreground py-4">No products yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">RSP</TableHead>
          <TableHead className="text-right">Case Size</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id} className="cursor-pointer hover:bg-muted/50">
            <TableCell>
              <Link href={`/products/${product.id}`} className="font-medium hover:underline">
                {product.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{product.sku_code ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{product.category ?? "—"}</TableCell>
            <TableCell className="text-right">
              {product.uk_rsp != null ? `£${product.uk_rsp.toFixed(2)}` : "—"}
            </TableCell>
            <TableCell className="text-right">{product.case_size ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**Step 2: Create brand detail page**

Create: `catalog-app/src/app/brands/[id]/page.tsx`

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getBrandById } from "@/lib/queries";
import { ProductTable } from "@/components/product-table";
import { Button } from "@/components/ui/button";

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const brand = getBrandById(db, Number(id));

  if (!brand) notFound();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-2">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← All Brands
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{brand.name}</h1>
          {brand.description && <p className="text-muted-foreground mt-1">{brand.description}</p>}
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            {brand.country && <span>{brand.country}</span>}
            {brand.website && (
              <a href={brand.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {brand.website}
              </a>
            )}
          </div>
        </div>
        <Link href={`/products/new?brand_id=${brand.id}`}>
          <Button>Add Product</Button>
        </Link>
      </div>

      <ProductTable products={brand.products} />
    </div>
  );
}
```

**Step 3: Verify build**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm run build
```

**Step 4: Commit**

```bash
git add catalog-app/src/
git commit -m "feat: add brand detail page with product table"
```

---

## Task 10: Product Detail/Edit Page

**Files:**
- Create: `catalog-app/src/components/product-form.tsx`
- Create: `catalog-app/src/app/products/[id]/page.tsx`
- Create: `catalog-app/src/app/products/new/page.tsx`

**Step 1: Create product form component**

Create: `catalog-app/src/components/product-form.tsx`

This is the largest component. It groups fields into collapsible sections matching the design doc: Identity, Commercial, Physical, Case & Pallet, Nutritional (per 100g), Nutritional (per serving), Other.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Product } from "@/types";

interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea";
}

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Identity",
    fields: [
      { name: "name", label: "Product Name" },
      { name: "sku_code", label: "SKU Code" },
      { name: "ean", label: "EAN" },
      { name: "case_ean", label: "Case EAN" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Category" },
      { name: "category_detail", label: "Sub-category" },
    ],
  },
  {
    title: "Commercial",
    fields: [
      { name: "uk_rsp", label: "UK RSP (£)", type: "number" },
      { name: "wholesale_case_cost", label: "Wholesale Case Cost (£)", type: "number" },
      { name: "case_size", label: "Case Size", type: "number" },
      { name: "vat_percent", label: "VAT %", type: "number" },
    ],
  },
  {
    title: "Physical (Unit)",
    fields: [
      { name: "unit_depth_mm", label: "Depth (mm)", type: "number" },
      { name: "unit_width_mm", label: "Width (mm)", type: "number" },
      { name: "unit_height_mm", label: "Height (mm)", type: "number" },
      { name: "unit_net_weight_g", label: "Net Weight (g)", type: "number" },
      { name: "unit_gross_weight_g", label: "Gross Weight (g)", type: "number" },
    ],
  },
  {
    title: "Case & Pallet",
    fields: [
      { name: "case_depth_mm", label: "Case Depth (mm)", type: "number" },
      { name: "case_width_mm", label: "Case Width (mm)", type: "number" },
      { name: "case_height_mm", label: "Case Height (mm)", type: "number" },
      { name: "pallet_qty", label: "Pallet Qty", type: "number" },
      { name: "layer_qty", label: "Layer Qty", type: "number" },
    ],
  },
  {
    title: "Nutritional (per 100g/ml)",
    fields: [
      { name: "energy_kj_per_100", label: "Energy (kJ)" },
      { name: "energy_kcal_per_100", label: "Energy (kcal)" },
      { name: "fat_per_100", label: "Fat (g)" },
      { name: "saturates_per_100", label: "Saturates (g)" },
      { name: "carbs_per_100", label: "Carbs (g)" },
      { name: "sugars_per_100", label: "Sugars (g)" },
      { name: "fibre_per_100", label: "Fibre (g)" },
      { name: "protein_per_100", label: "Protein (g)" },
      { name: "salt_per_100", label: "Salt (g)" },
    ],
  },
  {
    title: "Nutritional (per serving)",
    fields: [
      { name: "serving_type", label: "Serving Type (e.g. per 60ml)" },
      { name: "energy_kj_per_serving", label: "Energy (kJ)" },
      { name: "energy_kcal_per_serving", label: "Energy (kcal)" },
      { name: "fat_per_serving", label: "Fat (g)" },
      { name: "saturates_per_serving", label: "Saturates (g)" },
      { name: "carbs_per_serving", label: "Carbs (g)" },
      { name: "sugars_per_serving", label: "Sugars (g)" },
      { name: "fibre_per_serving", label: "Fibre (g)" },
      { name: "protein_per_serving", label: "Protein (g)" },
      { name: "salt_per_serving", label: "Salt (g)" },
    ],
  },
  {
    title: "Other",
    fields: [
      { name: "ingredients", label: "Ingredients", type: "textarea" },
      { name: "allergens", label: "Allergens", type: "textarea" },
      { name: "country_of_origin", label: "Country of Origin" },
      { name: "manufacturer_name", label: "Manufacturer Name" },
      { name: "manufacturer_address", label: "Manufacturer Address", type: "textarea" },
      { name: "shelf_life_days", label: "Shelf Life (days)", type: "number" },
    ],
  },
];

interface ProductFormProps {
  product?: Product;
  brandId: number;
}

export function ProductForm({ product, brandId }: ProductFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const isEdit = !!product;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { brand_id: brandId };

    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const val = form.get(field.name) as string;
        if (field.type === "number") {
          body[field.name] = val ? Number(val) : null;
        } else {
          body[field.name] = val || null;
        }
      }
    }

    const url = isEdit ? `/api/products/${product.id}` : "/api/products";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const saved = await res.json();
      router.push(`/products/${saved.id}`);
      router.refresh();
    } else {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {SECTIONS.map((section) => (
        <Collapsible key={section.title} defaultOpen={section.title === "Identity"}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 font-medium hover:bg-muted/50">
            {section.title}
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pt-4 pb-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((field) => (
                <div key={field.name} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                  <Label htmlFor={field.name}>{field.label}</Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.name}
                      name={field.name}
                      rows={3}
                      defaultValue={(product as Record<string, unknown>)?.[field.name] as string ?? ""}
                    />
                  ) : (
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type === "number" ? "number" : "text"}
                      step={field.type === "number" ? "any" : undefined}
                      defaultValue={(product as Record<string, unknown>)?.[field.name] as string ?? ""}
                      required={field.name === "name"}
                    />
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}

      <div className="flex gap-2 pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Product"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

**Step 2: Create product detail page**

Create: `catalog-app/src/app/products/[id]/page.tsx`

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getProductById } from "@/lib/queries";
import { ProductForm } from "@/components/product-form";
import { ImageGallery } from "@/components/image-upload";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const product = getProductById(db, Number(id));

  if (!product) notFound();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-2">
        <Link href={`/brands/${product.brand_id}`} className="text-sm text-muted-foreground hover:underline">
          ← {product.brand_name}
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">{product.name}</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Images</h2>
        <ImageGallery productId={product.id} images={product.images} />
      </div>

      <ProductForm product={product} brandId={product.brand_id} />
    </div>
  );
}
```

**Step 3: Create add product page**

Create: `catalog-app/src/app/products/new/page.tsx`

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getBrandById } from "@/lib/queries";
import { ProductForm } from "@/components/product-form";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ brand_id?: string }> }) {
  const { brand_id } = await searchParams;

  if (!brand_id) redirect("/");

  const db = getDb();
  const brand = getBrandById(db, Number(brand_id));

  if (!brand) redirect("/");

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-2">
        <Link href={`/brands/${brand.id}`} className="text-sm text-muted-foreground hover:underline">
          ← {brand.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Add Product to {brand.name}</h1>

      <ProductForm brandId={brand.id} />
    </div>
  );
}
```

**Step 4: Build to check for errors**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm run build
```

Note: This will fail because `ImageGallery` doesn't exist yet — that's Task 11. For now, comment out the ImageGallery import and usage in `products/[id]/page.tsx`, or proceed directly to Task 11 before building.

**Step 5: Commit**

```bash
git add catalog-app/src/
git commit -m "feat: add product form with collapsible sections and product pages"
```

---

## Task 11: Image Upload Component

**Files:**
- Create: `catalog-app/src/components/image-upload.tsx`

**Step 1: Create image gallery/upload component**

Create: `catalog-app/src/components/image-upload.tsx`

```tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductImage } from "@/types";

interface ImageGalleryProps {
  productId: number;
  images: ProductImage[];
}

export function ImageGallery({ productId, images }: ImageGalleryProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [imageType, setImageType] = useState<string>("hero");

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("image_type", imageType);
      form.append("sort_order", String(images.length));

      await fetch(`/api/products/${productId}/images`, {
        method: "POST",
        body: form,
      });
    }

    setUploading(false);
    router.refresh();
  }, [productId, imageType, images.length, router]);

  async function handleDelete(imageId: number) {
    await fetch(`/api/products/${productId}/images/${imageId}`, { method: "DELETE" });
    router.refresh();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  }

  return (
    <div>
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {images.map((img) => (
            <div key={img.id} className="relative group border rounded-lg overflow-hidden">
              <img
                src={`/api/images/${img.file_path}`}
                alt=""
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button size="sm" variant="destructive" onClick={() => handleDelete(img.id)}>
                  Remove
                </Button>
              </div>
              {img.image_type && (
                <span className="absolute top-1 left-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
                  {img.image_type}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors"
      >
        <p className="text-muted-foreground mb-2">
          {uploading ? "Uploading..." : "Drag & drop images here, or click to browse"}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Select value={imageType} onValueChange={setImageType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hero">Hero</SelectItem>
              <SelectItem value="pack">Pack</SelectItem>
              <SelectItem value="lifestyle">Lifestyle</SelectItem>
              <SelectItem value="nutritional">Nutritional</SelectItem>
            </SelectContent>
          </Select>
          <label>
            <Button variant="outline" asChild disabled={uploading}>
              <span>Browse Files</span>
            </Button>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add image delete API route**

Create: `catalog-app/src/app/api/products/[id]/images/[imageId]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteProductImage } from "@/lib/queries";
import fs from "fs";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { imageId } = await params;
  const db = getDb();

  // Get image record to find file path
  const image = db.prepare("SELECT file_path FROM product_images WHERE id = ?").get(Number(imageId)) as { file_path: string } | undefined;

  if (image) {
    const fullPath = path.join(IMAGES_DIR, image.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  deleteProductImage(db, Number(imageId));
  return new NextResponse(null, { status: 204 });
}
```

**Step 3: Build and verify**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add catalog-app/src/
git commit -m "feat: add image gallery with drag-and-drop upload"
```

---

## Task 12: Seed Script and Smoke Test

**Files:**
- Create: `catalog-app/src/lib/seed.ts`

**Step 1: Create seed script**

Create: `catalog-app/src/lib/seed.ts`

```typescript
import { getDb } from "./db";
import { createBrand, createProduct } from "./queries";

const db = getDb();

const moju = createBrand(db, {
  name: "MOJU",
  description: "Cold-pressed functional shots",
  logo_path: null,
  website: "https://www.mojudrinks.com",
  country: "United Kingdom",
});

createProduct(db, {
  brand_id: moju.id,
  name: "Ginger Shot 60ml",
  sku_code: "MOJU-GS60",
  ean: "5060421980018",
  description: "Cold-pressed ginger shot with lemon and cayenne pepper",
  category: "Drinks",
  category_detail: "Functional Shots",
  uk_rsp: 1.80,
  wholesale_case_cost: 10.80,
  case_size: 12,
  vat_percent: 0,
  unit_depth_mm: 38,
  unit_width_mm: 38,
  unit_height_mm: 95,
  unit_net_weight_g: 60,
  unit_gross_weight_g: 85,
  energy_kj_per_100: "92",
  energy_kcal_per_100: "22",
  fat_per_100: "0.1",
  saturates_per_100: "0",
  carbs_per_100: "4.3",
  sugars_per_100: "3.2",
  fibre_per_100: "0.3",
  protein_per_100: "0.3",
  salt_per_100: "0.01",
  serving_type: "per 60ml shot",
  energy_kj_per_serving: "55",
  energy_kcal_per_serving: "13",
  fat_per_serving: "0.1",
  saturates_per_serving: "0",
  carbs_per_serving: "2.6",
  sugars_per_serving: "1.9",
  fibre_per_serving: "0.2",
  protein_per_serving: "0.2",
  salt_per_serving: "0.01",
  ingredients: "Apple Juice (55%), Ginger Juice (25%), Lemon Juice (15%), Cayenne Pepper (5%)",
  allergens: "None",
  country_of_origin: "United Kingdom",
  manufacturer_name: "MOJU Ltd",
  manufacturer_address: "London, UK",
  shelf_life_days: 55,
});

createProduct(db, {
  brand_id: moju.id,
  name: "Turmeric Shot 60ml",
  sku_code: "MOJU-TS60",
  description: "Cold-pressed turmeric shot with ginger and black pepper",
  category: "Drinks",
  category_detail: "Functional Shots",
  uk_rsp: 1.80,
  wholesale_case_cost: 10.80,
  case_size: 12,
});

const loveCorn = createBrand(db, {
  name: "Love Corn",
  description: "Premium roasted corn snacks",
  logo_path: null,
  website: "https://www.lovecorn.com",
  country: "United Kingdom",
});

createProduct(db, {
  brand_id: loveCorn.id,
  name: "Sea Salt 45g",
  sku_code: "LC-SS45",
  description: "Crunchy roasted corn with sea salt",
  category: "Snacks",
  category_detail: "Corn Snacks",
  uk_rsp: 1.20,
  wholesale_case_cost: 8.40,
  case_size: 12,
});

console.log("Seeded: 2 brands, 3 products");
```

**Step 2: Add seed script to package.json**

In `catalog-app/package.json`, add to `"scripts"`:

```json
"seed": "npx tsx src/lib/seed.ts"
```

**Step 3: Run seed**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm install -D tsx
npm run seed
```

Expected: "Seeded: 2 brands, 3 products"

**Step 4: Start the dev server and verify manually**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm run dev
```

Open http://localhost:3000 — should show 2 brand cards. Click MOJU — should show 2 products. Click Ginger Shot — should show full product form.

**Step 5: Test the API with curl**

```bash
curl -s http://localhost:3000/api/brands | python3 -m json.tool
curl -s http://localhost:3000/api/brands/1 | python3 -m json.tool
curl -s http://localhost:3000/api/products/1 | python3 -m json.tool
```

Verify JSON responses with correct data.

**Step 6: Commit**

```bash
git add catalog-app/
git commit -m "feat: add seed script with test data and verify full app works"
```

---

## Task 13: Run Full Test Suite

**Step 1: Run all tests**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm test
```

Expected: All tests PASS.

**Step 2: Run build**

```bash
cd /Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app
npm run build
```

Expected: Build succeeds with no errors.

---

## Summary

| Task | What | Key Files |
|------|------|-----------|
| 1 | Scaffold Next.js project | `catalog-app/*` |
| 2 | TypeScript types | `src/types/index.ts` |
| 3 | SQLite database layer | `src/lib/db.ts` + test |
| 4 | Query functions | `src/lib/queries.ts` + test |
| 5 | Brand API routes | `src/app/api/brands/` |
| 6 | Product + image API routes | `src/app/api/products/`, `src/app/api/images/` |
| 7 | shadcn/ui setup | Component installs |
| 8 | Brands list page | `src/app/page.tsx`, `src/components/brand-card.tsx` |
| 9 | Brand detail page | `src/app/brands/[id]/page.tsx`, `src/components/product-table.tsx` |
| 10 | Product detail/edit pages | `src/app/products/*/page.tsx`, `src/components/product-form.tsx` |
| 11 | Image upload component | `src/components/image-upload.tsx` |
| 12 | Seed script + smoke test | `src/lib/seed.ts` |
| 13 | Final test + build | Verification |
