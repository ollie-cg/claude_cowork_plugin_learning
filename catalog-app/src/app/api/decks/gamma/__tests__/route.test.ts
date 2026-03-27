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
    const res = await POST(req as any);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
