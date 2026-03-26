import { describe, it, expect } from "vitest";
import { PB_LOGO_WHITE_BASE64 } from "@/lib/pb-assets";

describe("pb-assets", () => {
  it("exports a base64 data URI for the white logo", () => {
    expect(PB_LOGO_WHITE_BASE64).toMatch(/^data:image\/webp;base64,/);
    expect(PB_LOGO_WHITE_BASE64.length).toBeGreaterThan(100);
  });
});
