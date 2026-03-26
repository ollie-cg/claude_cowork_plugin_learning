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
    const deepDiveCount = (html.match(/slide-deep-dive/g) || []).length;
    expect(deepDiveCount).toBe(3);
  });

  it("has dark closing slide with Next Steps", () => {
    const html = renderDeckHtml({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", imageMap });
    const lastSlideIndex = html.lastIndexOf("slide-dark");
    const nextStepsIndex = html.indexOf("Next Steps");
    expect(lastSlideIndex).toBeGreaterThan(0);
    expect(nextStepsIndex).toBeGreaterThan(0);
  });
});
