# Deck Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an API-driven HTML deck generator that pulls brand/product data and images from the catalog DB and produces self-contained, prospect-tailored pitch decks.

**Architecture:** POST `/api/decks/generate` accepts a brand ID, required product IDs, prospect name, and optional message. It fetches data from SQLite, reads images from disk as base64, renders a full-viewport HTML deck using a template function, saves to `data/decks/`, and returns the filename. GET `/api/decks/[filename]` serves the generated HTML.

**Tech Stack:** Next.js 16.2.1 (App Router), better-sqlite3, fs/path for image encoding, TypeScript.

---

## Existing Code Reference

- **DB access:** `getDb()` from `src/lib/db.ts` returns a better-sqlite3 `Database` instance
- **Queries:** `src/lib/queries.ts` — has `getBrandById(db, id)`, `getProductById(db, id)` (returns `ProductWithImages`)
- **Types:** `src/types/index.ts` — `Brand`, `Product`, `ProductWithImages`, `ProductImage`, `BrandDetail`
- **Images on disk:** `data/images/{brandId}/{productId}/{filename}` (webp/jpg)
- **Route pattern:** params are `Promise<{ id: string }>` in Next.js 16 — must `await params`

---

### Task 1: Add `getProductsByIds` query

**Files:**
- Modify: `src/lib/queries.ts`
- Test: `src/lib/__tests__/queries.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/queries.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/queries.test.ts`
Expected: FAIL — `getProductsByIds` is not exported

**Step 3: Write the implementation**

Add to the bottom of `src/lib/queries.ts` (before the file ends):

```typescript
export function getProductsByIds(db: Database.Database, ids: number[]): ProductWithImages[] {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const products = db.prepare(`
    SELECT p.*, b.name AS brand_name
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id IN (${placeholders})
  `).all(...ids) as (Product & { brand_name: string })[];

  // Fetch images for all products in one query
  const allImages = db.prepare(`
    SELECT * FROM product_images
    WHERE product_id IN (${placeholders})
    ORDER BY sort_order
  `).all(...ids) as ProductImage[];

  const imagesByProduct = new Map<number, ProductImage[]>();
  for (const img of allImages) {
    const list = imagesByProduct.get(img.product_id) || [];
    list.push(img);
    imagesByProduct.set(img.product_id, list);
  }

  // Preserve the order of the input IDs
  const productMap = new Map(products.map(p => [p.id, p]));
  return ids
    .map(id => productMap.get(id))
    .filter((p): p is (Product & { brand_name: string }) => p !== undefined)
    .map(p => ({ ...p, images: imagesByProduct.get(p.id) || [] }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/queries.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/queries.ts src/lib/__tests__/queries.test.ts
git commit -m "feat: add getProductsByIds query for deck generator"
```

---

### Task 2: Create the HTML deck template

**Files:**
- Create: `src/lib/deck-template.ts`
- Test: `src/lib/__tests__/deck-template.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/deck-template.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderDeckHtml } from "@/lib/deck-template";
import type { Brand, ProductWithImages } from "@/types";

const mockBrand: Brand = {
  id: 1,
  name: "MOJU",
  description: "Cold-pressed functional shots",
  logo_path: null,
  website: "https://mojudrinks.com",
  country: "United Kingdom",
  created_at: "",
  updated_at: "",
};

const mockProducts: ProductWithImages[] = [
  {
    id: 10,
    brand_id: 1,
    name: "Ginger Dosing Bottle 420ml",
    description: "A fiery ginger shot",
    uk_rsp: 6.95,
    case_size: 4,
    wholesale_case_cost: null,
    ingredients: "Apple Juice (60%), Ginger Juice (18%)",
    energy_kcal_per_100: "42",
    category: "Functional Shots",
    images: [
      { id: 1, product_id: 10, file_path: "1/10/hero.webp", image_type: "hero", sort_order: 0, created_at: "" },
    ],
    // remaining fields null
  } as ProductWithImages,
];

describe("renderDeckHtml", () => {
  it("returns a complete HTML document", () => {
    const html = renderDeckHtml({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      imageMap: new Map([["1/10/hero.webp", "data:image/webp;base64,AAAA"]]),
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes prospect name on title slide", () => {
    const html = renderDeckHtml({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      imageMap: new Map(),
    });

    expect(html).toContain("Tesco");
  });

  it("includes optional message when provided", () => {
    const html = renderDeckHtml({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      message: "For the wellness aisle",
      imageMap: new Map(),
    });

    expect(html).toContain("For the wellness aisle");
  });

  it("renders product slides with name and RSP", () => {
    const html = renderDeckHtml({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      imageMap: new Map(),
    });

    expect(html).toContain("Ginger Dosing Bottle 420ml");
    expect(html).toContain("£6.95");
  });

  it("embeds base64 images when available", () => {
    const html = renderDeckHtml({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      imageMap: new Map([["1/10/hero.webp", "data:image/webp;base64,AAAA"]]),
    });

    expect(html).toContain("data:image/webp;base64,AAAA");
  });

  it("renders commercial summary table", () => {
    const html = renderDeckHtml({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      imageMap: new Map(),
    });

    expect(html).toContain("Commercial Summary");
    expect(html).toContain("Ginger Dosing Bottle");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/deck-template.test.ts`
Expected: FAIL — `renderDeckHtml` not found

**Step 3: Write the implementation**

Create `src/lib/deck-template.ts`. This is the largest file. The function signature:

```typescript
import type { Brand, ProductWithImages } from "@/types";

interface DeckOptions {
  brand: Brand;
  products: ProductWithImages[];
  prospectName: string;
  message?: string;
  imageMap: Map<string, string>; // file_path → data URI
}

export function renderDeckHtml(opts: DeckOptions): string {
  const { brand, products, prospectName, message, imageMap } = opts;

  const getImage = (filePath: string) => imageMap.get(filePath) || "";
  const heroImage = (p: ProductWithImages) => {
    const hero = p.images.find(i => i.image_type === "hero");
    return hero ? getImage(hero.file_path) : "";
  };
  const formatPrice = (v: number | null) => v != null ? `£${v.toFixed(2)}` : "—";
  const esc = (s: string | null | undefined) => (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  // --- Slide renderers ---

  const titleSlide = `
    <section class="slide title-slide">
      <div class="slide-content center">
        <h1>${esc(brand.name)}</h1>
        <p class="subtitle">Product Range for ${esc(prospectName)}</p>
        ${message ? `<p class="message">${esc(message)}</p>` : ""}
      </div>
    </section>`;

  const brandSlide = `
    <section class="slide brand-slide">
      <div class="slide-content">
        <h2>About ${esc(brand.name)}</h2>
        <p class="brand-description">${esc(brand.description)}</p>
        <div class="brand-meta">
          ${brand.website ? `<p><strong>Website:</strong> ${esc(brand.website)}</p>` : ""}
          ${brand.country ? `<p><strong>Origin:</strong> ${esc(brand.country)}</p>` : ""}
        </div>
      </div>
    </section>`;

  const overviewSlide = `
    <section class="slide overview-slide">
      <div class="slide-content">
        <h2>Product Range</h2>
        <div class="product-grid">
          ${products.map(p => {
            const src = heroImage(p);
            return `
              <div class="product-card">
                ${src ? `<img src="${src}" alt="${esc(p.name)}" />` : `<div class="no-image"></div>`}
                <h3>${esc(p.name)}</h3>
                <p class="price">${formatPrice(p.uk_rsp)}</p>
              </div>`;
          }).join("")}
        </div>
      </div>
    </section>`;

  const productSlides = products.map(p => {
    const images = p.images.map(i => getImage(i.file_path)).filter(Boolean);
    return `
    <section class="slide product-slide">
      <div class="slide-content product-layout">
        <div class="product-images">
          ${images.length > 0
            ? images.map(src => `<img src="${src}" alt="${esc(p.name)}" />`).join("")
            : `<div class="no-image large"></div>`}
        </div>
        <div class="product-info">
          <h2>${esc(p.name)}</h2>
          ${p.category ? `<p class="category">${esc(p.category)}</p>` : ""}
          ${p.description ? `<p class="description">${esc(p.description)}</p>` : ""}
          <div class="product-details">
            <p><strong>RSP:</strong> ${formatPrice(p.uk_rsp)}</p>
            ${p.case_size ? `<p><strong>Case Size:</strong> ${p.case_size} units</p>` : ""}
            ${p.ingredients ? `<p><strong>Ingredients:</strong> ${esc(p.ingredients)}</p>` : ""}
          </div>
          ${p.energy_kcal_per_100 ? `
          <table class="nutrition-table">
            <caption>Nutritional Info per 100ml</caption>
            <tr><td>Energy</td><td>${esc(p.energy_kcal_per_100)} kcal</td></tr>
            ${p.fat_per_100 ? `<tr><td>Fat</td><td>${esc(p.fat_per_100)}g</td></tr>` : ""}
            ${p.carbs_per_100 ? `<tr><td>Carbs</td><td>${esc(p.carbs_per_100)}g</td></tr>` : ""}
            ${p.sugars_per_100 ? `<tr><td>Sugars</td><td>${esc(p.sugars_per_100)}g</td></tr>` : ""}
            ${p.protein_per_100 ? `<tr><td>Protein</td><td>${esc(p.protein_per_100)}g</td></tr>` : ""}
            ${p.salt_per_100 ? `<tr><td>Salt</td><td>${esc(p.salt_per_100)}g</td></tr>` : ""}
          </table>` : ""}
        </div>
      </div>
    </section>`;
  }).join("");

  const commercialSlide = `
    <section class="slide commercial-slide">
      <div class="slide-content">
        <h2>Commercial Summary</h2>
        <table class="commercial-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>RSP</th>
              <th>Case Size</th>
              ${products.some(p => p.wholesale_case_cost) ? "<th>Case Cost</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td>${esc(p.name)}</td>
                <td>${formatPrice(p.uk_rsp)}</td>
                <td>${p.case_size || "—"}</td>
                ${products.some(pr => pr.wholesale_case_cost) ? `<td>${formatPrice(p.wholesale_case_cost)}</td>` : ""}
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;

  const contactSlide = `
    <section class="slide contact-slide">
      <div class="slide-content center">
        <h2>Next Steps</h2>
        <p>Interested in stocking ${esc(brand.name)}?</p>
        <p class="contact-cta">Get in touch with your PluginBrands representative to discuss ranging, pricing, and delivery.</p>
      </div>
      <footer class="deck-footer">Presented by PluginBrands</footer>
    </section>`;

  // --- Full HTML ---
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(brand.name)} — ${esc(prospectName)}</title>
  <style>
    /* ... CSS will go here — see step 3 implementation ... */
  </style>
</head>
<body>
  ${titleSlide}
  ${brandSlide}
  ${overviewSlide}
  ${productSlides}
  ${commercialSlide}
  ${contactSlide}
</body>
</html>`;
}
```

The CSS in the `<style>` block should include:
- Reset/base styles, system font stack
- `.slide` — 100vw × 100vh, flex column, page-break-after for print
- `.slide-content` — max-width 1100px, centered padding
- `.center` — flexbox centering for title/contact slides
- `.product-grid` — CSS grid, 3 columns, gap
- `.product-card` — card with image, name, price
- `.product-layout` — 2-column layout (images left, info right)
- `.nutrition-table`, `.commercial-table` — clean bordered tables
- `.deck-footer` — small text bottom-right
- `@media print` — page breaks per slide, no overflow
- Brand accent colour as CSS variable: `--accent: #ff6b00` (MOJU orange — this could be parameterised later)

**Note:** The full CSS is ~120 lines. The implementer should write clean, minimal CSS covering the slide types above. Keep it simple — no animations, no external fonts.

**Step 4: Run test to verify it passes**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/deck-template.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/lib/deck-template.ts src/lib/__tests__/deck-template.test.ts
git commit -m "feat: add HTML deck template renderer"
```

---

### Task 3: Create the deck generation API endpoint

**Files:**
- Create: `src/app/api/decks/generate/route.ts`

**Step 1: Write the failing test**

Create `src/app/api/decks/generate/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the generation logic by calling the route handler directly.
// Since it depends on DB and filesystem, we test the endpoint integration-style
// by mocking the DB and fs modules.

describe("POST /api/decks/generate", () => {
  it("returns 400 if brand_id is missing", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost:3000/api/decks/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospect_name: "Tesco", product_ids: [10] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 if product_ids is empty", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost:3000/api/decks/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: 1, prospect_name: "Tesco", product_ids: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 if prospect_name is missing", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost:3000/api/decks/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: 1, product_ids: [10] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd catalog-app && npx vitest run src/app/api/decks/generate/__tests__/route.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/app/api/decks/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBrandById, getProductsByIds } from "@/lib/queries";
import { renderDeckHtml } from "@/lib/deck-template";
import fs from "fs";
import path from "path";

const DECKS_DIR = path.join(process.cwd(), "data", "decks");
const IMAGES_DIR = path.join(process.cwd(), "data", "images");

function buildImageMap(products: { images: { file_path: string }[] }[]): Map<string, string> {
  const map = new Map<string, string>();
  const mimeTypes: Record<string, string> = {
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
  };

  for (const product of products) {
    for (const img of product.images) {
      const absPath = path.join(IMAGES_DIR, img.file_path);
      if (fs.existsSync(absPath)) {
        const ext = path.extname(absPath).toLowerCase();
        const mime = mimeTypes[ext] || "application/octet-stream";
        const b64 = fs.readFileSync(absPath).toString("base64");
        map.set(img.file_path, `data:${mime};base64,${b64}`);
      }
    }
  }
  return map;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { brand_id, product_ids, prospect_name, message } = body;

  if (!brand_id) {
    return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
  }
  if (!prospect_name?.trim()) {
    return NextResponse.json({ error: "prospect_name is required" }, { status: 400 });
  }
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return NextResponse.json({ error: "product_ids must be a non-empty array" }, { status: 400 });
  }

  const db = getDb();
  const brandDetail = getBrandById(db, Number(brand_id));
  if (!brandDetail) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const products = getProductsByIds(db, product_ids.map(Number));
  if (products.length === 0) {
    return NextResponse.json({ error: "No products found for given IDs" }, { status: 404 });
  }

  const imageMap = buildImageMap(products);

  const html = renderDeckHtml({
    brand: brandDetail,
    products,
    prospectName: prospect_name.trim(),
    message: message?.trim() || undefined,
    imageMap,
  });

  // Save to disk
  if (!fs.existsSync(DECKS_DIR)) {
    fs.mkdirSync(DECKS_DIR, { recursive: true });
  }

  const slug = prospect_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const brandSlug = brandDetail.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${brandSlug}_${slug}_${timestamp}.html`;

  fs.writeFileSync(path.join(DECKS_DIR, filename), html, "utf-8");

  return NextResponse.json({ filename, url: `/api/decks/${filename}` });
}
```

**Step 4: Run test to verify it passes**

Run: `cd catalog-app && npx vitest run src/app/api/decks/generate/__tests__/route.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/app/api/decks/generate/route.ts src/app/api/decks/generate/__tests__/route.test.ts
git commit -m "feat: add deck generation API endpoint"
```

---

### Task 4: Create the deck serving route

**Files:**
- Create: `src/app/api/decks/[filename]/route.ts`

**Step 1: Write the implementation**

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DECKS_DIR = path.join(process.cwd(), "data", "decks");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Only allow .html files, no path traversal
  if (!filename.endsWith(".html") || filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(DECKS_DIR, filename);

  if (!filePath.startsWith(DECKS_DIR) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  const html = fs.readFileSync(filePath, "utf-8");

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
```

**Step 2: Manual test**

After tasks 1-3 are complete, run the dev server and test end-to-end:

```bash
cd catalog-app && npm run dev
```

Then in another terminal:

```bash
curl -X POST http://localhost:3000/api/decks/generate \
  -H "Content-Type: application/json" \
  -d '{"brand_id": 1, "product_ids": [10, 11, 12], "prospect_name": "Tesco"}'
```

Expected: `{ "filename": "moju_tesco_20260326.html", "url": "/api/decks/moju_tesco_20260326.html" }`

Then open `http://localhost:3000/api/decks/moju_tesco_20260326.html` in a browser to verify the deck renders.

**Step 3: Commit**

```bash
git add src/app/api/decks/[filename]/route.ts
git commit -m "feat: add deck serving route"
```

---

### Task 5: End-to-end visual test and polish

**Step 1: Generate a test deck with all 6 MOJU products**

```bash
curl -X POST http://localhost:3000/api/decks/generate \
  -H "Content-Type: application/json" \
  -d '{"brand_id": 1, "product_ids": [10, 11, 12, 13, 14, 15], "prospect_name": "Sainsburys", "message": "For the wellness and functional drinks aisle"}'
```

**Step 2: Open in browser and verify**

Check each slide:
- [ ] Title slide shows "MOJU" and "Product Range for Sainsburys" and the message
- [ ] Brand slide shows description, website, country
- [ ] Product overview grid shows 6 products with hero images and RSPs
- [ ] Each product deep-dive slide shows images, description, ingredients, nutritional table
- [ ] Commercial summary table lists all 6 products with RSP and case size
- [ ] Contact slide shows "Presented by PluginBrands"
- [ ] Images render correctly (not broken)
- [ ] Print preview (Cmd+P) shows one slide per page

**Step 3: Fix any CSS/layout issues found during visual inspection**

Adjust the CSS in `deck-template.ts` until the deck looks professional. Key things to get right:
- Hero images should be large and prominent
- Text should be readable (16px+ body, 32px+ headings)
- The product grid should not overflow
- Tables should be clean with alternating row colours

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: deck generator complete — HTML pitch decks from catalog data"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | `getProductsByIds` query + test | `queries.ts`, `queries.test.ts` |
| 2 | HTML deck template + test | `deck-template.ts`, `deck-template.test.ts` |
| 3 | POST `/api/decks/generate` + test | `route.ts`, `route.test.ts` |
| 4 | GET `/api/decks/[filename]` | `route.ts` |
| 5 | End-to-end visual test + polish | CSS tweaks |
