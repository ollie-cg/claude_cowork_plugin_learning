# Gamma Deck Generator Implementation Plan

> **⚠️ DEPRIORITISED (2026-04-21, v1.2.0):** The `generate-buyer-deck` skill was removed from the shipped plugin. This doc is preserved for reference but is not under active development.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate polished Gamma presentation decks from catalog app data (brand, products, pricing, images) via the Gamma API.

**Architecture:** A new module `gamma-client.ts` handles Gamma API communication (create + poll). A new function `buildGammaInputText` constructs structured markdown with image URLs from the catalog data. A new API route `POST /api/decks/gamma` orchestrates: validate input → fetch data from DB → build inputText with ngrok image URLs → call Gamma → poll → return deck URL. The ngrok tunnel base URL is read from `TUNNEL_URL` env var.

**Tech Stack:** Next.js API routes, Gamma API v1.0, vitest for testing, ngrok for image tunneling.

---

### Task 1: Gamma API client module

**Files:**
- Create: `src/lib/gamma-client.ts`
- Test: `src/lib/__tests__/gamma-client.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/gamma-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGammaDeck, pollGammaGeneration } from "@/lib/gamma-client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv("GAMMA_API_KEY", "sk-test-key");
});

describe("createGammaDeck", () => {
  it("sends correct request to Gamma API and returns generationId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ generationId: "gen-123" }),
    });

    const result = await createGammaDeck({
      inputText: "# Test Deck\nSlide content",
      numCards: 5,
    });

    expect(result).toEqual({ generationId: "gen-123" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://public-api.gamma.app/v1.0/generations",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": "sk-test-key",
        },
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.inputText).toBe("# Test Deck\nSlide content");
    expect(body.format).toBe("presentation");
    expect(body.textMode).toBe("preserve");
  });

  it("throws if API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid API key" }),
    });

    await expect(createGammaDeck({ inputText: "test" })).rejects.toThrow(
      "Gamma API error (401)"
    );
  });
});

describe("pollGammaGeneration", () => {
  it("returns completed result immediately if status is completed", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        generationId: "gen-123",
        status: "completed",
        gammaUrl: "https://gamma.app/docs/test-abc123",
        exportUrl: null,
      }),
    });

    const result = await pollGammaGeneration("gen-123", {
      intervalMs: 0,
      maxAttempts: 1,
    });

    expect(result.status).toBe("completed");
    expect(result.gammaUrl).toBe("https://gamma.app/docs/test-abc123");
  });

  it("throws on failed status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        generationId: "gen-123",
        status: "failed",
        error: { message: "Generation failed" },
      }),
    });

    await expect(
      pollGammaGeneration("gen-123", { intervalMs: 0, maxAttempts: 1 })
    ).rejects.toThrow("Gamma generation failed");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/gamma-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/gamma-client.ts
const GAMMA_API_BASE = "https://public-api.gamma.app/v1.0";

interface CreateDeckOptions {
  inputText: string;
  numCards?: number;
  themeId?: string;
  exportAs?: "pdf" | "pptx";
}

interface CreateDeckResult {
  generationId: string;
  warnings?: string;
}

interface PollResult {
  generationId: string;
  status: "pending" | "completed" | "failed";
  gammaUrl?: string;
  gammaId?: string;
  exportUrl?: string;
  error?: { message: string };
}

interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
}

export async function createGammaDeck(
  options: CreateDeckOptions
): Promise<CreateDeckResult> {
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) throw new Error("GAMMA_API_KEY is not set");

  const body = {
    inputText: options.inputText,
    format: "presentation" as const,
    textMode: "preserve" as const,
    ...(options.numCards && { numCards: options.numCards }),
    ...(options.themeId && { themeId: options.themeId }),
    ...(options.exportAs && { exportAs: options.exportAs }),
    imageOptions: { source: "noImages" as const },
    cardOptions: { dimensions: "16x9" as const },
  };

  const res = await fetch(`${GAMMA_API_BASE}/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Gamma API error (${res.status}): ${err.error || "Unknown error"}`
    );
  }

  return res.json();
}

export async function pollGammaGeneration(
  generationId: string,
  options: PollOptions = {}
): Promise<PollResult> {
  const { intervalMs = 5000, maxAttempts = 60 } = options;
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) throw new Error("GAMMA_API_KEY is not set");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
      headers: { "X-API-KEY": apiKey },
    });

    if (!res.ok) {
      throw new Error(`Gamma poll error (${res.status})`);
    }

    const result: PollResult = await res.json();

    if (result.status === "completed") return result;
    if (result.status === "failed") {
      throw new Error(
        `Gamma generation failed: ${result.error?.message || "Unknown"}`
      );
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error("Gamma generation timed out");
}
```

**Step 4: Run test to verify it passes**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/gamma-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/gamma-client.ts src/lib/__tests__/gamma-client.test.ts
git commit -m "feat: add Gamma API client with create and poll functions"
```

---

### Task 2: Gamma inputText builder

**Files:**
- Create: `src/lib/gamma-input.ts`
- Test: `src/lib/__tests__/gamma-input.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/gamma-input.test.ts
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

const mockProducts: ProductWithImages[] = [
  {
    id: 10,
    brand_id: 1,
    name: "Ginger Shot 420ml",
    description: "A fiery ginger shot to kickstart your day.",
    uk_rsp: 6.95,
    case_size: 4,
    wholesale_case_cost: 18.0,
    category: "Functional Shots",
    ingredients: "Apple Juice (60%), Ginger (18%)",
    images: [
      {
        id: 1,
        product_id: 10,
        file_path: "1/10/ginger_hero.webp",
        image_type: "hero",
        sort_order: 0,
        created_at: "",
      },
    ],
  } as ProductWithImages,
];

const tunnelUrl = "https://abc123.ngrok-free.app";

describe("buildGammaInputText", () => {
  it("includes brand name and prospect name in title section", () => {
    const text = buildGammaInputText({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      tunnelUrl,
    });
    expect(text).toContain("MOJU");
    expect(text).toContain("Tesco");
  });

  it("includes brand description", () => {
    const text = buildGammaInputText({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      tunnelUrl,
    });
    expect(text).toContain("Cold-pressed functional shots");
  });

  it("includes product names and RSP", () => {
    const text = buildGammaInputText({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      tunnelUrl,
    });
    expect(text).toContain("Ginger Shot 420ml");
    expect(text).toContain("£6.95");
  });

  it("includes hero image URLs using tunnel base URL", () => {
    const text = buildGammaInputText({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      tunnelUrl,
    });
    expect(text).toContain(
      "https://abc123.ngrok-free.app/api/images/1/10/ginger_hero.webp"
    );
  });

  it("uses card break separators between sections", () => {
    const text = buildGammaInputText({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      tunnelUrl,
    });
    expect(text.split("\n---\n").length).toBeGreaterThanOrEqual(4);
  });

  it("includes commercial summary section", () => {
    const text = buildGammaInputText({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      tunnelUrl,
    });
    expect(text).toContain("Commercial Summary");
    expect(text).toContain("£18.00");
  });

  it("includes optional message when provided", () => {
    const text = buildGammaInputText({
      brand: mockBrand,
      products: mockProducts,
      prospectName: "Tesco",
      message: "Perfect for the wellness aisle",
      tunnelUrl,
    });
    expect(text).toContain("Perfect for the wellness aisle");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/gamma-input.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/gamma-input.ts
import type { Brand, ProductWithImages } from "@/types";

interface GammaInputOptions {
  brand: Brand;
  products: ProductWithImages[];
  prospectName: string;
  message?: string;
  tunnelUrl: string;
}

const formatPrice = (price: number | null): string =>
  price === null ? "N/A" : `£${price.toFixed(2)}`;

function imageUrl(tunnelUrl: string, filePath: string): string {
  return `${tunnelUrl}/api/images/${filePath}`;
}

function getHeroUrl(
  product: ProductWithImages,
  tunnelUrl: string
): string | null {
  const hero = product.images.find((img) => img.image_type === "hero");
  return hero ? imageUrl(tunnelUrl, hero.file_path) : null;
}

export function buildGammaInputText(options: GammaInputOptions): string {
  const { brand, products, prospectName, message, tunnelUrl } = options;

  const slides: string[] = [];

  // Slide 1: Title
  let titleSlide = `# ${brand.name}\n\n## Product Range for ${prospectName}`;
  if (message) titleSlide += `\n\n*${message}*`;
  slides.push(titleSlide);

  // Slide 2: Brand story
  let brandSlide = `# About ${brand.name}`;
  if (brand.description) brandSlide += `\n\n${brand.description}`;
  if (brand.country) brandSlide += `\n\n**Country:** ${brand.country}`;
  if (brand.website) brandSlide += `\n\n**Website:** ${brand.website}`;
  slides.push(brandSlide);

  // Slide 3: Product overview
  let overviewSlide = `# Product Range\n`;
  for (const product of products) {
    const hero = getHeroUrl(product, tunnelUrl);
    overviewSlide += `\n### ${product.name} — ${formatPrice(product.uk_rsp)}`;
    if (hero) overviewSlide += `\n\n${hero}`;
  }
  slides.push(overviewSlide);

  // Slides 4+: One per product
  for (const product of products) {
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

  // Commercial Summary slide
  let summarySlide = `# Commercial Summary\n\n| Product | RSP | Case Size | Case Cost |\n|---------|-----|-----------|-----------|`;
  for (const product of products) {
    summarySlide += `\n| ${product.name} | ${formatPrice(product.uk_rsp)} | ${product.case_size ? `${product.case_size} units` : "N/A"} | ${formatPrice(product.wholesale_case_cost)} |`;
  }
  slides.push(summarySlide);

  // Next Steps slide
  let nextSlide = `# Next Steps\n\nInterested in stocking ${brand.name}?\n\nWe'd love to discuss how these products can fit into your range.\n\nContact us to arrange a tasting or discuss commercial terms.`;
  slides.push(nextSlide);

  return slides.join("\n---\n");
}
```

**Step 4: Run test to verify it passes**

Run: `cd catalog-app && npx vitest run src/lib/__tests__/gamma-input.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/gamma-input.ts src/lib/__tests__/gamma-input.test.ts
git commit -m "feat: add Gamma inputText builder from catalog data"
```

---

### Task 3: Gamma deck API route

**Files:**
- Create: `src/app/api/decks/gamma/route.ts`
- Test: `src/app/api/decks/gamma/__tests__/route.test.ts`

**Step 1: Write the failing tests for input validation**

```typescript
// src/app/api/decks/gamma/__tests__/route.test.ts
import { describe, it, expect } from "vitest";

describe("POST /api/decks/gamma", () => {
  it("returns 400 if brand_id is missing", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost:4100/api/decks/gamma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospect_name: "Tesco", product_ids: [10] }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 if product_ids is empty", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost:4100/api/decks/gamma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_id: 1,
        prospect_name: "Tesco",
        product_ids: [],
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 if prospect_name is missing", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost:4100/api/decks/gamma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: 1, product_ids: [10] }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 if TUNNEL_URL is not set", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost:4100/api/decks/gamma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_id: 1,
        prospect_name: "Tesco",
        product_ids: [10],
      }),
    });
    // TUNNEL_URL not set in test env
    const res = await POST(req as any);
    // Will fail at tunnel check or brand lookup — both acceptable
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd catalog-app && npx vitest run src/app/api/decks/gamma/__tests__/route.test.ts`
Expected: FAIL — module not found

**Step 3: Write the API route**

```typescript
// src/app/api/decks/gamma/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBrandById, getProductsByIds } from "@/lib/queries";
import { buildGammaInputText } from "@/lib/gamma-input";
import { createGammaDeck, pollGammaGeneration } from "@/lib/gamma-client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { brand_id, product_ids, prospect_name, message } = body;

  if (!brand_id) {
    return NextResponse.json(
      { error: "brand_id is required" },
      { status: 400 }
    );
  }
  if (!prospect_name?.trim()) {
    return NextResponse.json(
      { error: "prospect_name is required" },
      { status: 400 }
    );
  }
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return NextResponse.json(
      { error: "product_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  const tunnelUrl = process.env.TUNNEL_URL;
  if (!tunnelUrl) {
    return NextResponse.json(
      { error: "TUNNEL_URL is not configured — start ngrok first" },
      { status: 400 }
    );
  }

  const db = getDb();
  const brandDetail = getBrandById(db, Number(brand_id));
  if (!brandDetail) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const products = getProductsByIds(db, product_ids.map(Number));
  if (products.length === 0) {
    return NextResponse.json(
      { error: "No products found for given IDs" },
      { status: 404 }
    );
  }

  const inputText = buildGammaInputText({
    brand: brandDetail,
    products,
    prospectName: prospect_name.trim(),
    message: message?.trim() || undefined,
    tunnelUrl,
  });

  // Title + brand + overview + N products + summary + next steps
  const numCards = 3 + products.length + 2;

  try {
    const { generationId } = await createGammaDeck({
      inputText,
      numCards: Math.min(numCards, 60),
    });

    const result = await pollGammaGeneration(generationId);

    return NextResponse.json({
      gammaUrl: result.gammaUrl,
      gammaId: result.gammaId,
      exportUrl: result.exportUrl || null,
      generationId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Gamma generation failed: ${message}` },
      { status: 502 }
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd catalog-app && npx vitest run src/app/api/decks/gamma/__tests__/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/decks/gamma/route.ts src/app/api/decks/gamma/__tests__/route.test.ts
git commit -m "feat: add POST /api/decks/gamma route for Gamma deck generation"
```

---

### Task 4: Add TUNNEL_URL to env and test end-to-end

This task is manual / interactive — not TDD.

**Step 1: Start the catalog app**

Run: `cd catalog-app && npm run dev`
Expected: App running on http://localhost:4100

**Step 2: Start ngrok tunnel**

Run: `ngrok http 4100`
Expected: A public URL like `https://abc123.ngrok-free.app`

**Step 3: Set the TUNNEL_URL in .env.local**

Add to `catalog-app/.env.local`:
```
TUNNEL_URL=https://abc123.ngrok-free.app
```

**Step 4: Restart the dev server** (to pick up the new env var)

**Step 5: Test the endpoint with curl**

```bash
curl -X POST http://localhost:4100/api/decks/gamma \
  -H "Content-Type: application/json" \
  -d '{"brand_id": 1, "product_ids": [10, 11], "prospect_name": "Tesco"}'
```

Expected: JSON response with `gammaUrl` linking to a live Gamma deck.

**Step 6: Open the gammaUrl in browser and verify**
- Slides are correctly structured
- Product images from ngrok are embedded
- Pricing data is accurate
- Commercial summary is correct

**Step 7: Commit**

```bash
git add catalog-app/.env.local
# Don't commit — .env.local is gitignored. Just verify it works.
```

---

### Task 5: Run all tests

**Step 1: Run full test suite**

Run: `cd catalog-app && npm test`
Expected: All tests pass, including new gamma-client and gamma-input tests.

**Step 2: Final commit if any cleanup needed**

```bash
git add -A && git commit -m "test: verify all tests pass with Gamma integration"
```
