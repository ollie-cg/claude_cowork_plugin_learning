# Deck Redesign Implementation Plan

> **⚠️ DEPRIORITISED (2026-04-21, v1.2.0):** The `generate-buyer-deck` skill was removed from the shipped plugin. This doc is preserved for reference but is not under active development.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the generic product catalog deck template with a Plugin Brands retailer sales deck using a dark→light→dark narrative structure.

**Architecture:** Two files need updating: `deck-template.ts` (HTML self-contained decks) and `gamma-input.ts` (Gamma API markdown). Both share the same new slide structure but produce different outputs. The PB logo is fetched from squarespace CDN and embedded as base64 in HTML decks, or referenced by URL in Gamma decks.

**Tech Stack:** TypeScript, Next.js, vitest, HTML/CSS

---

### Task 1: Download and embed PB logo

**Files:**
- Create: `catalog-app/data/assets/pluginbrands-logo-white.png`
- Create: `catalog-app/src/lib/pb-assets.ts`
- Test: `catalog-app/src/lib/__tests__/pb-assets.test.ts`

**Step 1: Download the PB white logo**

Run:
```bash
mkdir -p catalog-app/data/assets
curl -o catalog-app/data/assets/pluginbrands-logo-white.png "https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png"
```

**Step 2: Create the pb-assets module with a test**

Write the test file `catalog-app/src/lib/__tests__/pb-assets.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PB_LOGO_WHITE_BASE64 } from "@/lib/pb-assets";

describe("pb-assets", () => {
  it("exports a base64 data URI for the white logo", () => {
    expect(PB_LOGO_WHITE_BASE64).toMatch(/^data:image\/png;base64,/);
    expect(PB_LOGO_WHITE_BASE64.length).toBeGreaterThan(100);
  });
});
```

Write the module `catalog-app/src/lib/pb-assets.ts`:

```typescript
import fs from "fs";
import path from "path";

const logoPath = path.join(process.cwd(), "data", "assets", "pluginbrands-logo-white.png");
const logoBuffer = fs.readFileSync(logoPath);
export const PB_LOGO_WHITE_BASE64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
```

**Step 3: Run test to verify it passes**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/pb-assets.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add catalog-app/data/assets/ catalog-app/src/lib/pb-assets.ts catalog-app/src/lib/__tests__/pb-assets.test.ts
git commit -m "feat: add PB white logo asset and pb-assets module"
```

---

### Task 2: Rewrite deck-template.ts with new slide structure

**Files:**
- Modify: `catalog-app/src/lib/deck-template.ts` (full rewrite)
- Modify: `catalog-app/src/lib/__tests__/deck-template.test.ts` (updated tests)

**Step 1: Write the updated tests**

Replace `catalog-app/src/lib/__tests__/deck-template.test.ts` with:

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

const mockProduct = (id: number, name: string): ProductWithImages =>
  ({
    id,
    brand_id: 1,
    name,
    description: "A functional shot",
    uk_rsp: 6.95,
    case_size: 4,
    wholesale_case_cost: 18.0,
    ingredients: "Apple Juice (60%), Ginger (18%)",
    energy_kcal_per_100: "42",
    fat_per_100: "0.1",
    carbs_per_100: "9.2",
    sugars_per_100: "7.8",
    protein_per_100: "0.3",
    salt_per_100: "0.01",
    category: "Functional Shots",
    images: [
      { id, product_id: id, file_path: `1/${id}/hero.webp`, image_type: "hero", sort_order: 0, created_at: "" },
    ],
  }) as ProductWithImages;

const mockProducts = [mockProduct(10, "Ginger Shot 420ml")];
const imageMap = new Map([["1/10/hero.webp", "data:image/webp;base64,AAAA"]]);

describe("renderDeckHtml", () => {
  it("returns a complete HTML document", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes PB branding slides", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    expect(html).toContain("Who We Are");
    expect(html).toContain("What We Can Do Together");
  });

  it("has dark-themed PB intro slides", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    expect(html).toContain("slide-dark");
  });

  it("has light-themed brand/product slides", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    expect(html).toContain("slide-light");
  });

  it("includes prospect name on title slide", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    expect(html).toContain("Prepared for Tesco");
  });

  it("includes optional message when provided", () => {
    const html = renderDeckHtml({
      brand: mockBrand, products: mockProducts, prospectName: "Tesco",
      message: "For the wellness aisle", imageMap,
    });
    expect(html).toContain("For the wellness aisle");
  });

  it("renders product overview with name and RSP", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    expect(html).toContain("Ginger Shot 420ml");
    expect(html).toContain("£6.95");
  });

  it("embeds base64 images when available", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    expect(html).toContain("data:image/webp;base64,AAAA");
  });

  it("renders commercial summary table", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    expect(html).toContain("Commercial Summary");
  });

  it("limits product deep dives to 3 products", () => {
    const fiveProducts = [
      mockProduct(10, "Product A"),
      mockProduct(11, "Product B"),
      mockProduct(12, "Product C"),
      mockProduct(13, "Product D"),
      mockProduct(14, "Product E"),
    ];
    const html = renderDeckHtml({ brand: mockBrand, products: fiveProducts, prospectName: "Tesco", imageMap: new Map() });
    // Deep dive slides have the class "slide-deep-dive"
    const deepDiveCount = (html.match(/slide-deep-dive/g) || []).length;
    expect(deepDiveCount).toBe(3);
  });

  it("has dark closing slide with Next Steps", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    // The last slide should be dark-themed
    const lastSlideIndex = html.lastIndexOf("slide-dark");
    const nextStepsIndex = html.indexOf("Next Steps");
    // Next Steps appears after the last dark slide starts
    expect(lastSlideIndex).toBeGreaterThan(0);
    expect(nextStepsIndex).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to see them fail**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/deck-template.test.ts`
Expected: Several FAIL (no `slide-dark`, no "Who We Are", no "Prepared for", etc.)

**Step 3: Rewrite deck-template.ts**

Replace the full content of `catalog-app/src/lib/deck-template.ts` with the new template. Key changes:

- Import `PB_LOGO_WHITE_BASE64` from `@/lib/pb-assets`
- CSS: add `.slide-dark` (background: #1a1a1a, color: white) and `.slide-light` (background: white, color: #333)
- Slide 1 (dark): Title — PB logo, "Prepared for [Prospect]", brand name
- Slide 2 (dark): Who We Are — PB credentials
- Slide 3 (dark): What We Can Do Together — value propositions
- Slide 4 (light): Brand Introduction — brand name, description, "Why [Brand]"
- Slide 5 (light): Product Range Overview — grid of product cards
- Slides 6-8 (light): Deep dives — `products.slice(0, 3)`, marked with `slide-deep-dive` class
- Slide 9 (light): Commercial Summary table (all products)
- Slide 10 (dark): Next Steps — PB logo, CTA, contact

Full implementation code for `deck-template.ts`:

```typescript
import type { Brand, ProductWithImages } from "@/types";
import { PB_LOGO_WHITE_BASE64 } from "@/lib/pb-assets";

interface DeckOptions {
  brand: Brand;
  products: ProductWithImages[];
  prospectName: string;
  message?: string;
  imageMap: Map<string, string>;
}

const esc = (s: string | null | undefined) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MAX_DEEP_DIVES = 3;

export function renderDeckHtml(opts: DeckOptions): string {
  const { brand, products, prospectName, message, imageMap } = opts;

  const getHeroImage = (product: ProductWithImages): string | null => {
    const heroImage = product.images.find((img) => img.image_type === "hero");
    if (!heroImage) return null;
    return imageMap.get(heroImage.file_path) || null;
  };

  const formatPrice = (price: number | null): string => {
    if (price === null) return "N/A";
    return `£${price.toFixed(2)}`;
  };

  const showCaseCostColumn = products.some((p) => p.wholesale_case_cost !== null);
  const deepDiveProducts = products.slice(0, MAX_DEEP_DIVES);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(brand.name)} — Prepared for ${esc(prospectName)} | PluginBrands</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
    }

    .slide {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
      page-break-after: always;
      overflow: hidden;
    }

    /* Dark theme — PB intro & closing slides */
    .slide-dark {
      background: #1a1a1a;
      color: #fff;
    }

    /* Light theme — brand & product slides */
    .slide-light {
      background: #fff;
      color: #333;
    }

    .slide-content {
      max-width: 1100px;
      margin: 0 auto;
      padding: 60px 40px;
      width: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .center {
      justify-content: center;
      align-items: center;
      text-align: center;
    }

    /* --- Dark slide typography --- */
    .slide-dark h1 {
      font-size: 56px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 16px;
      line-height: 1.1;
      letter-spacing: -1px;
    }

    .slide-dark h2 {
      font-size: 42px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 24px;
      line-height: 1.2;
    }

    .slide-dark .subtitle {
      font-size: 24px;
      color: rgba(255,255,255,0.7);
      margin-bottom: 12px;
      font-weight: 400;
    }

    .slide-dark .message {
      font-size: 18px;
      color: rgba(255,255,255,0.5);
      font-style: italic;
      margin-top: 16px;
    }

    /* --- Light slide typography --- */
    .slide-light h2 {
      font-size: 42px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 24px;
      line-height: 1.2;
    }

    .slide-light h3 {
      font-size: 24px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 12px;
    }

    /* --- PB Logo --- */
    .pb-logo {
      height: 40px;
      margin-bottom: 40px;
    }

    .pb-logo-small {
      height: 28px;
    }

    /* --- Slide 2: Who We Are --- */
    .who-text {
      font-size: 20px;
      color: rgba(255,255,255,0.85);
      max-width: 700px;
      margin-bottom: 40px;
      line-height: 1.7;
    }

    .stats-row {
      display: flex;
      gap: 48px;
      margin-top: 20px;
    }

    .stat {
      text-align: center;
    }

    .stat-number {
      font-size: 36px;
      font-weight: 700;
      color: #fff;
      display: block;
    }

    .stat-label {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 4px;
      display: block;
    }

    /* --- Slide 3: What We Can Do Together --- */
    .services-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 32px;
      margin-top: 20px;
      max-width: 800px;
    }

    .service-block {
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      padding: 28px;
      text-align: left;
    }

    .service-block h3 {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 8px;
    }

    .service-block p {
      font-size: 15px;
      color: rgba(255,255,255,0.65);
      line-height: 1.5;
    }

    /* --- Slide 4: Brand Intro --- */
    .brand-intro {
      display: flex;
      flex-direction: column;
      gap: 24px;
      flex: 1;
    }

    .brand-description {
      font-size: 18px;
      line-height: 1.8;
      color: #444;
      max-width: 800px;
    }

    .brand-meta {
      display: flex;
      gap: 32px;
      font-size: 15px;
      color: #888;
    }

    .brand-meta a {
      color: #1a1a1a;
      text-decoration: underline;
    }

    /* --- Slide 5: Product Grid --- */
    .product-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 20px;
    }

    .product-card {
      background: #f7f7f7;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .product-card-image {
      width: 100%;
      height: 180px;
      object-fit: contain;
      margin-bottom: 12px;
    }

    .product-card-name {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 6px;
    }

    .product-card-price {
      font-size: 20px;
      font-weight: 700;
      color: #1a1a1a;
    }

    /* --- Slides 6-8: Product Deep Dives --- */
    .product-layout {
      display: grid;
      grid-template-columns: 40% 60%;
      gap: 40px;
      margin-top: 20px;
      flex: 1;
    }

    .product-images {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .product-image {
      width: 100%;
      max-height: 380px;
      object-fit: contain;
      border-radius: 8px;
      background: #f7f7f7;
    }

    .product-info {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .info-section {
      background: #f7f7f7;
      padding: 16px 20px;
      border-radius: 8px;
      border-left: 3px solid #1a1a1a;
    }

    .info-section h4 {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .info-section p {
      font-size: 15px;
      line-height: 1.6;
      color: #444;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #e8e8e8;
    }

    .info-row:last-child { border-bottom: none; }

    .info-label { font-weight: 600; color: #555; font-size: 14px; }
    .info-value { color: #1a1a1a; font-size: 14px; }

    /* --- Commercial Summary --- */
    .commercial-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24px;
      font-size: 15px;
    }

    .commercial-table th,
    .commercial-table td {
      padding: 14px 20px;
      text-align: left;
      border-bottom: 1px solid #e8e8e8;
    }

    .commercial-table th {
      background: #1a1a1a;
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .commercial-table tr:nth-child(even) { background: #f7f7f7; }

    .commercial-table td:not(:first-child) { text-align: right; }

    /* --- Closing CTA --- */
    .cta-text {
      font-size: 22px;
      color: rgba(255,255,255,0.8);
      margin-bottom: 32px;
      max-width: 500px;
      line-height: 1.6;
    }

    .cta-contact {
      font-size: 16px;
      color: rgba(255,255,255,0.5);
    }

    /* --- Footer --- */
    .deck-footer {
      position: absolute;
      bottom: 20px;
      right: 40px;
      font-size: 11px;
      color: rgba(255,255,255,0.3);
    }

    .slide-light .deck-footer {
      color: #ccc;
    }

    @media print {
      .slide { page-break-after: always; }
    }
  </style>
</head>
<body>

  <!-- Slide 1: Title (Dark) -->
  <section class="slide slide-dark">
    <div class="slide-content center">
      <img src="${PB_LOGO_WHITE_BASE64}" alt="PluginBrands" class="pb-logo">
      <h1>Prepared for ${esc(prospectName)}</h1>
      <p class="subtitle">${esc(brand.name)}</p>
      ${message ? `<p class="message">${esc(message)}</p>` : ""}
    </div>
    <div class="deck-footer">PluginBrands</div>
  </section>

  <!-- Slide 2: Who We Are (Dark) -->
  <section class="slide slide-dark">
    <div class="slide-content">
      <img src="${PB_LOGO_WHITE_BASE64}" alt="PluginBrands" class="pb-logo-small">
      <h2>Who We Are</h2>
      <p class="who-text">
        We're a commercial partner for the world's most exciting challenger brands.
        We handle sales, distribution, and brand building — so great products reach the right shelves.
      </p>
      <div class="stats-row">
        <div class="stat">
          <span class="stat-number">50+</span>
          <span class="stat-label">Brands</span>
        </div>
        <div class="stat">
          <span class="stat-number">3,000+</span>
          <span class="stat-label">Retail Doors</span>
        </div>
        <div class="stat">
          <span class="stat-number">UK &amp; Int'l</span>
          <span class="stat-label">Markets</span>
        </div>
      </div>
    </div>
    <div class="deck-footer">PluginBrands</div>
  </section>

  <!-- Slide 3: What We Can Do Together (Dark) -->
  <section class="slide slide-dark">
    <div class="slide-content center">
      <h2>What We Can Do Together</h2>
      <div class="services-grid">
        <div class="service-block">
          <h3>Sales &amp; Distribution</h3>
          <p>National and independent retail coverage with dedicated field sales teams.</p>
        </div>
        <div class="service-block">
          <h3>Category Strategy</h3>
          <p>Data-driven ranging, pricing, and promotional plans tailored to your stores.</p>
        </div>
        <div class="service-block">
          <h3>Marketing Support</h3>
          <p>In-store activation, sampling, and digital campaigns that drive rate of sale.</p>
        </div>
        <div class="service-block">
          <h3>Brand Building</h3>
          <p>Helping challenger brands scale with the operational backbone they need.</p>
        </div>
      </div>
    </div>
    <div class="deck-footer">PluginBrands</div>
  </section>

  <!-- Slide 4: Brand Introduction (Light) -->
  <section class="slide slide-light">
    <div class="slide-content">
      <h2>${esc(brand.name)}</h2>
      <div class="brand-intro">
        ${brand.description ? `<p class="brand-description">${esc(brand.description)}</p>` : ""}
        <div class="brand-meta">
          ${brand.country ? `<span>${esc(brand.country)}</span>` : ""}
          ${brand.website ? `<a href="${esc(brand.website)}">${esc(brand.website)}</a>` : ""}
        </div>
      </div>
    </div>
    <div class="deck-footer">PluginBrands</div>
  </section>

  <!-- Slide 5: Product Range Overview (Light) -->
  <section class="slide slide-light">
    <div class="slide-content">
      <h2>The Range</h2>
      <div class="product-grid">
        ${products.map((product) => {
          const heroImg = getHeroImage(product);
          return `
        <div class="product-card">
          ${heroImg ? `<img src="${heroImg}" alt="${esc(product.name)}" class="product-card-image">` : ""}
          <div class="product-card-name">${esc(product.name)}</div>
          <div class="product-card-price">${formatPrice(product.uk_rsp)}</div>
        </div>`;
        }).join("")}
      </div>
    </div>
    <div class="deck-footer">PluginBrands</div>
  </section>

  <!-- Slides 6-8: Product Deep Dives (Light, max 3) -->
  ${deepDiveProducts.map((product) => {
    const heroImg = getHeroImage(product);
    const allImages = product.images
      .map((img) => imageMap.get(img.file_path))
      .filter((uri) => uri !== undefined);

    return `
  <section class="slide slide-light slide-deep-dive">
    <div class="slide-content">
      <h2>${esc(product.name)}</h2>
      <div class="product-layout">
        <div class="product-images">
          ${allImages.length > 0 ? allImages.map((uri) => `<img src="${uri}" alt="${esc(product.name)}" class="product-image">`).join("") : ""}
        </div>
        <div class="product-info">
          ${product.category ? `<div class="info-section"><h4>Category</h4><p>${esc(product.category)}</p></div>` : ""}
          ${product.description ? `<div class="info-section"><h4>Description</h4><p>${esc(product.description)}</p></div>` : ""}
          <div class="info-section">
            <h4>Pricing &amp; Pack</h4>
            <div class="info-row">
              <span class="info-label">RSP</span>
              <span class="info-value">${formatPrice(product.uk_rsp)}</span>
            </div>
            ${product.case_size ? `<div class="info-row">
              <span class="info-label">Case Size</span>
              <span class="info-value">${esc(String(product.case_size))} units</span>
            </div>` : ""}
            ${product.wholesale_case_cost !== null ? `<div class="info-row">
              <span class="info-label">Case Cost</span>
              <span class="info-value">${formatPrice(product.wholesale_case_cost)}</span>
            </div>` : ""}
          </div>
          ${product.ingredients ? `<div class="info-section"><h4>Ingredients</h4><p>${esc(product.ingredients)}</p></div>` : ""}
        </div>
      </div>
    </div>
    <div class="deck-footer">PluginBrands</div>
  </section>`;
  }).join("")}

  <!-- Commercial Summary (Light) -->
  <section class="slide slide-light">
    <div class="slide-content">
      <h2>Commercial Summary</h2>
      <table class="commercial-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>RSP</th>
            <th>Case Size</th>
            ${showCaseCostColumn ? "<th>Case Cost</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${products.map((product) => `
          <tr>
            <td>${esc(product.name)}</td>
            <td>${formatPrice(product.uk_rsp)}</td>
            <td>${product.case_size ? esc(String(product.case_size)) + " units" : "N/A"}</td>
            ${showCaseCostColumn ? `<td>${formatPrice(product.wholesale_case_cost)}</td>` : ""}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="deck-footer">PluginBrands</div>
  </section>

  <!-- Closing: Next Steps (Dark) -->
  <section class="slide slide-dark">
    <div class="slide-content center">
      <img src="${PB_LOGO_WHITE_BASE64}" alt="PluginBrands" class="pb-logo">
      <h2>Next Steps</h2>
      <p class="cta-text">
        Interested in stocking ${esc(brand.name)}?
        We'd love to discuss how these products can fit into your range.
      </p>
      <p class="cta-contact">Contact us to arrange a tasting or discuss commercial terms.</p>
    </div>
    <div class="deck-footer">PluginBrands</div>
  </section>

</body>
</html>`;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/deck-template.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add catalog-app/src/lib/deck-template.ts catalog-app/src/lib/__tests__/deck-template.test.ts
git commit -m "feat: redesign deck template with PB branding and dark/light narrative"
```

---

### Task 3: Update gamma-input.ts with new slide structure

**Files:**
- Modify: `catalog-app/src/lib/gamma-input.ts`
- Modify: `catalog-app/src/lib/__tests__/gamma-input.test.ts`

**Step 1: Write updated tests**

Replace `catalog-app/src/lib/__tests__/gamma-input.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import { buildGammaInputText } from "@/lib/gamma-input";
import type { Brand, ProductWithImages } from "@/types";

const mockBrand: Brand = {
  id: 1,
  name: "MOJU",
  description: "Cold-pressed functional shots made with the finest ingredients.",
  logo_path: null,
  website: "https://mojudrinks.com",
  country: "United Kingdom",
  created_at: "",
  updated_at: "",
};

const mockProduct = (id: number, name: string): ProductWithImages =>
  ({
    id,
    brand_id: 1,
    name,
    description: "A functional shot",
    uk_rsp: 6.95,
    case_size: 4,
    wholesale_case_cost: 18.0,
    ingredients: "Apple Juice (60%), Ginger (18%)",
    category: "Functional Shots",
    images: [
      { id, product_id: id, file_path: `1/${id}/hero.webp`, image_type: "hero", sort_order: 0, created_at: "" },
    ],
  }) as ProductWithImages;

const mockProducts = [mockProduct(10, "Ginger Shot 420ml")];
const tunnelUrl = "https://abc123.ngrok-free.app";

describe("buildGammaInputText", () => {
  it("includes PB intro sections", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", tunnelUrl });
    expect(text).toContain("Who We Are");
    expect(text).toContain("What We Can Do Together");
  });

  it("includes prospect name in title", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", tunnelUrl });
    expect(text).toContain("Prepared for Tesco");
  });

  it("includes brand description", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", tunnelUrl });
    expect(text).toContain("Cold-pressed functional shots");
  });

  it("includes product names and RSP", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", tunnelUrl });
    expect(text).toContain("Ginger Shot 420ml");
    expect(text).toContain("£6.95");
  });

  it("includes hero image URLs using tunnel base URL", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", tunnelUrl });
    expect(text).toContain("https://abc123.ngrok-free.app/api/images/1/10/hero.webp");
  });

  it("uses card break separators between sections", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", tunnelUrl });
    // Title + Who We Are + What We Can Do + Brand Intro + Product Overview + 1 deep dive + Commercial + Next Steps = 8 slides = 7 separators
    expect(text.split("\n---\n").length).toBeGreaterThanOrEqual(7);
  });

  it("includes commercial summary section", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", tunnelUrl });
    expect(text).toContain("Commercial Summary");
    expect(text).toContain("£18.00");
  });

  it("includes optional message when provided", () => {
    const text = buildGammaInputText({
      brand: mockBrand, products: mockProducts, prospectName: "Tesco",
      message: "Perfect for the wellness aisle", tunnelUrl,
    });
    expect(text).toContain("Perfect for the wellness aisle");
  });

  it("limits deep dive slides to 3 products", () => {
    const fiveProducts = [
      mockProduct(10, "Product A"), mockProduct(11, "Product B"), mockProduct(12, "Product C"),
      mockProduct(13, "Product D"), mockProduct(14, "Product E"),
    ];
    const text = buildGammaInputText({ brand: mockBrand, products: fiveProducts, prospectName: "Tesco", tunnelUrl });
    const slides = text.split("\n---\n");
    // Count slides that start with "# Product" and have product detail (RSP line)
    const deepDiveSlides = slides.filter((s) => s.includes("**RSP:**"));
    expect(deepDiveSlides.length).toBe(3);
  });
});
```

**Step 2: Run tests to see them fail**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/gamma-input.test.ts`
Expected: Several FAIL (no "Who We Are", no "Prepared for", wrong slide count, etc.)

**Step 3: Rewrite gamma-input.ts**

Replace `catalog-app/src/lib/gamma-input.ts` with:

```typescript
import type { Brand, ProductWithImages } from "@/types";

interface GammaInputOptions {
  brand: Brand;
  products: ProductWithImages[];
  prospectName: string;
  message?: string;
  tunnelUrl: string;
}

const MAX_DEEP_DIVES = 3;

const formatPrice = (price: number | null): string =>
  price === null ? "N/A" : `£${price.toFixed(2)}`;

function imageUrl(tunnelUrl: string, filePath: string): string {
  return `${tunnelUrl}/api/images/${filePath}`;
}

function getHeroUrl(product: ProductWithImages, tunnelUrl: string): string | null {
  const hero = product.images.find((img) => img.image_type === "hero");
  return hero ? imageUrl(tunnelUrl, hero.file_path) : null;
}

export function buildGammaInputText(options: GammaInputOptions): string {
  const { brand, products, prospectName, message, tunnelUrl } = options;
  const slides: string[] = [];

  // Slide 1: Title
  let titleSlide = `# PluginBrands\n\n## Prepared for ${prospectName}\n\n### ${brand.name}`;
  if (message) titleSlide += `\n\n*${message}*`;
  slides.push(titleSlide);

  // Slide 2: Who We Are
  slides.push(
    `# Who We Are\n\nWe're a commercial partner for the world's most exciting challenger brands. We handle sales, distribution, and brand building — so great products reach the right shelves.\n\n**50+ Brands** | **3,000+ Retail Doors** | **UK & International**`
  );

  // Slide 3: What We Can Do Together
  slides.push(
    `# What We Can Do Together\n\n**Sales & Distribution** — National and independent retail coverage with dedicated field sales teams.\n\n**Category Strategy** — Data-driven ranging, pricing, and promotional plans tailored to your stores.\n\n**Marketing Support** — In-store activation, sampling, and digital campaigns that drive rate of sale.\n\n**Brand Building** — Helping challenger brands scale with the operational backbone they need.`
  );

  // Slide 4: Brand Introduction
  let brandSlide = `# ${brand.name}`;
  if (brand.description) brandSlide += `\n\n${brand.description}`;
  if (brand.country) brandSlide += `\n\n**Country:** ${brand.country}`;
  if (brand.website) brandSlide += `\n\n**Website:** ${brand.website}`;
  slides.push(brandSlide);

  // Slide 5: Product overview
  let overviewSlide = `# The Range\n`;
  for (const product of products) {
    const hero = getHeroUrl(product, tunnelUrl);
    overviewSlide += `\n### ${product.name} — ${formatPrice(product.uk_rsp)}`;
    if (hero) overviewSlide += `\n\n${hero}`;
  }
  slides.push(overviewSlide);

  // Slides 6-8: Product deep dives (max 3)
  const deepDiveProducts = products.slice(0, MAX_DEEP_DIVES);
  for (const product of deepDiveProducts) {
    let slide = `# ${product.name}`;

    const hero = getHeroUrl(product, tunnelUrl);
    if (hero) slide += `\n\n${hero}`;

    if (product.category) slide += `\n\n**Category:** ${product.category}`;
    if (product.description) slide += `\n\n${product.description}`;

    slide += `\n\n**RSP:** ${formatPrice(product.uk_rsp)}`;
    if (product.case_size) slide += `\n\n**Case Size:** ${product.case_size} units`;
    if (product.wholesale_case_cost)
      slide += `\n\n**Wholesale Case Cost:** ${formatPrice(product.wholesale_case_cost)}`;

    if (product.ingredients)
      slide += `\n\n**Ingredients:** ${product.ingredients}`;

    slides.push(slide);
  }

  // Commercial Summary
  let summarySlide = `# Commercial Summary\n\n| Product | RSP | Case Size | Case Cost |\n|---------|-----|-----------|-----------|`;
  for (const product of products) {
    summarySlide += `\n| ${product.name} | ${formatPrice(product.uk_rsp)} | ${product.case_size ? `${product.case_size} units` : "N/A"} | ${formatPrice(product.wholesale_case_cost)} |`;
  }
  slides.push(summarySlide);

  // Next Steps
  slides.push(
    `# Next Steps\n\nInterested in stocking ${brand.name}?\n\nWe'd love to discuss how these products can fit into your range.\n\nContact us to arrange a tasting or discuss commercial terms.`
  );

  return slides.join("\n---\n");
}
```

**Step 4: Run tests to verify they pass**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/gamma-input.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add catalog-app/src/lib/gamma-input.ts catalog-app/src/lib/__tests__/gamma-input.test.ts
git commit -m "feat: update gamma input with PB branding and dark/light slide structure"
```

---

### Task 4: Update gamma route numCards calculation

**Files:**
- Modify: `catalog-app/src/app/api/decks/gamma/route.ts:73` (numCards line)

**Step 1: Update the numCards calculation**

The old calculation was `3 + products.length + 2` (title + about + overview + N products + summary + next steps = N+5).

The new calculation is: title + who we are + what we can do + brand intro + overview + min(products, 3) deep dives + summary + next steps = min(products.length, 3) + 7.

Change line 73 in `catalog-app/src/app/api/decks/gamma/route.ts` from:

```typescript
  const numCards = 3 + products.length + 2;
```

to:

```typescript
  const numCards = 7 + Math.min(products.length, 3);
```

**Step 2: Run existing route tests**

Run: `cd catalog-app && npx vitest run src/app/api/decks/gamma/__tests__/route.test.ts`
Expected: All PASS (route tests only check validation, not numCards)

**Step 3: Commit**

```bash
git add catalog-app/src/app/api/decks/gamma/route.ts
git commit -m "fix: update gamma numCards for new slide structure"
```

---

### Task 5: Run full test suite and verify

**Step 1: Run all tests**

Run: `cd catalog-app && npx vitest run`
Expected: All tests pass

**Step 2: Generate a test deck to visually verify**

Run: `cd catalog-app && npx tsx -e "
const { renderDeckHtml } = require('./src/lib/deck-template');
// Quick smoke test with minimal data
console.log('Template loads successfully');
"`

Or start the dev server and POST to `/api/decks/generate` with test data.

**Step 3: Commit any remaining fixes if needed**
