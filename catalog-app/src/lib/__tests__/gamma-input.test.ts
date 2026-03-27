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
const baseUrl = "https://abc123.ngrok-free.app";

describe("buildGammaInputText", () => {
  it("includes PB intro sections", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", baseUrl });
    expect(text).toContain("Who We Are");
    expect(text).toContain("What We Can Do Together");
  });

  it("includes prospect name in title", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", baseUrl });
    expect(text).toContain("Prepared for Tesco");
  });

  it("includes brand description", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", baseUrl });
    expect(text).toContain("Cold-pressed functional shots");
  });

  it("includes product names and RSP", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", baseUrl });
    expect(text).toContain("Ginger Shot 420ml");
    expect(text).toContain("£6.95");
  });

  it("includes hero image URLs using base URL", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", baseUrl });
    expect(text).toContain("https://abc123.ngrok-free.app/api/images/1/10/hero.webp");
  });

  it("uses card break separators between sections", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", baseUrl });
    // Title + Who We Are + What We Can Do + Brand Intro + Product Overview + 1 deep dive + Commercial + Next Steps = 8 slides = 7 separators
    expect(text.split("\n---\n").length).toBeGreaterThanOrEqual(7);
  });

  it("includes commercial summary section", () => {
    const text = buildGammaInputText({ brand: mockBrand, products: mockProducts, prospectName: "Tesco", baseUrl });
    expect(text).toContain("Commercial Summary");
    expect(text).toContain("£18.00");
  });

  it("includes optional message when provided", () => {
    const text = buildGammaInputText({
      brand: mockBrand, products: mockProducts, prospectName: "Tesco",
      message: "Perfect for the wellness aisle", baseUrl,
    });
    expect(text).toContain("Perfect for the wellness aisle");
  });

  it("limits deep dive slides to 3 products", () => {
    const fiveProducts = [
      mockProduct(10, "Product A"), mockProduct(11, "Product B"), mockProduct(12, "Product C"),
      mockProduct(13, "Product D"), mockProduct(14, "Product E"),
    ];
    const text = buildGammaInputText({ brand: mockBrand, products: fiveProducts, prospectName: "Tesco", baseUrl });
    const slides = text.split("\n---\n");
    // Count slides that have "**RSP:**" (deep dive detail)
    const deepDiveSlides = slides.filter((s) => s.includes("**RSP:**"));
    expect(deepDiveSlides.length).toBe(3);
  });
});
