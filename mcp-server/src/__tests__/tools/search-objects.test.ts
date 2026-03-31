import { describe, it, expect, vi } from "vitest";
import { searchObjects } from "../../tools/search-objects.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(postResult: unknown): ToolContext {
  return {
    hubspot: { post: vi.fn().mockResolvedValue(postResult) } as any,
    user: { name: "Test User", hubspot_owner_id: "111" },
  };
}

describe("searchObjects", () => {
  it("calls HubSpot search endpoint and returns results", async () => {
    const ctx = makeContext({ total: 1, results: [{ id: "42" }] });
    const result = await searchObjects(
      { objectType: "0-970", filterGroups: [{ filters: [{ propertyName: "client_name_sync", operator: "EQ", value: "MOJU" }] }], properties: ["hs_name", "buyer_name"], limit: 10 },
      ctx
    );
    expect(ctx.hubspot.post).toHaveBeenCalledWith("/crm/v3/objects/0-970/search", {
      filterGroups: [{ filters: [{ propertyName: "client_name_sync", operator: "EQ", value: "MOJU" }] }],
      properties: ["hs_name", "buyer_name"],
      limit: 10,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(1);
  });

  it("passes sorts when provided", async () => {
    const ctx = makeContext({ total: 0, results: [] });
    await searchObjects(
      { objectType: "contacts", properties: ["firstname"], sorts: [{ propertyName: "createdate", direction: "DESCENDING" }] },
      ctx
    );
    expect(ctx.hubspot.post).toHaveBeenCalledWith(
      "/crm/v3/objects/contacts/search",
      expect.objectContaining({ sorts: [{ propertyName: "createdate", direction: "DESCENDING" }] })
    );
  });
});
