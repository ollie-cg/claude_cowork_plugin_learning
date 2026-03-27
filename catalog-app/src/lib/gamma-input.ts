/**
 * Gamma Input Builder for Catalog App API
 *
 * This module builds markdown for the catalog app's API-driven deck generation endpoint
 * (/api/decks/gamma). It provides a quick deck generation path using catalog data.
 *
 * For buyer-tailored decks with HubSpot intelligence and custom narratives, use the
 * generate-buyer-deck skill which builds markdown directly with buyer-specific insights.
 */

import type { Brand, ProductWithImages } from "@/types";

interface GammaInputOptions {
  brand: Brand;
  products: ProductWithImages[];
  prospectName: string;
  message?: string;
  tunnelUrl: string;
  prospectLogoUrl?: string;
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
  const { brand, products, prospectName, message, tunnelUrl, prospectLogoUrl } = options;
  const slides: string[] = [];

  const pbLogoUrl = "https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png";

  // Slide 1: Title with partnership logos
  let titleSlide = `# Prepared for ${prospectName}\n\n## ${brand.name}`;
  if (message) titleSlide += `\n\n*${message}*`;
  if (prospectLogoUrl) {
    titleSlide += `\n\n| Partner Logos |\n|:---:|\n| ![PluginBrands](${pbLogoUrl}) |\n| ![${prospectName}](${prospectLogoUrl}) |`;
  } else {
    titleSlide += `\n\n![PluginBrands](${pbLogoUrl})`;
  }
  slides.push(titleSlide);

  // Slide 2: Who We Are
  slides.push(
    `# Who We Are\n\n**Plugin Brands** is an outsourced commercial team for consumer brands.\n\nWe partner with innovative food and drink brands to unlock retail distribution across the UK and Europe.\n\n**Our approach:**\n- Dedicated category experts\n- Data-driven pitch strategies\n- Long-term buyer relationships\n- End-to-end sales support\n\nWe don't just open doors — we drive sustainable growth.`
  );

  // Slide 3: What We Can Do Together
  slides.push(
    `# What We Can Do Together\n\n## Four pillars of partnership:\n\n**1. Category Insight**\nMarket data, consumer trends, and competitive intelligence to position your range for maximum impact.\n\n**2. Tailored Pitching**\nWe know your buyers. Every pitch is crafted to align with their priorities and trading strategies.\n\n**3. Operational Excellence**\nFrom samples to purchase orders, we manage the process so you can focus on product.\n\n**4. Ongoing Support**\nLaunch isn't the finish line. We monitor performance, optimize listings, and identify expansion opportunities.`
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
    `# Next Steps\n\n![PluginBrands](${pbLogoUrl})\n\nInterested in stocking ${brand.name}?\n\nWe'd love to discuss how these products can fit into your range.\n\nContact us to arrange a tasting or discuss commercial terms.`
  );

  return slides.join("\n---\n");
}
