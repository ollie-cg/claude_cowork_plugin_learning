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
