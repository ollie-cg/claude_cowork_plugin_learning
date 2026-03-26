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

    .slide-dark {
      background: #1a1a1a;
      color: #fff;
    }

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

    .pb-logo {
      height: 40px;
      margin-bottom: 40px;
    }

    .pb-logo-small {
      height: 28px;
    }

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

    .stat { text-align: center; }

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

    .brand-meta a { color: #1a1a1a; text-decoration: underline; }

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

    .deck-footer {
      position: absolute;
      bottom: 20px;
      right: 40px;
      font-size: 11px;
      color: rgba(255,255,255,0.3);
    }

    .slide-light .deck-footer { color: #ccc; }

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
