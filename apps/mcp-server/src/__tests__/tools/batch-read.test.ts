import { describe, it, expect, vi } from "vitest";
import { batchRead } from "../../tools/batch-read.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(postResult: unknown): ToolContext {
  return { hubspot: { post: vi.fn().mockResolvedValue(postResult) } as any, user: { name: "Test User", hubspot_owner_id: "111" } };
}

describe("batchRead", () => {
  it("sends batch read request with IDs and properties", async () => {
    const ctx = makeContext({ results: [{ id: "1", properties: { hs_name: "A" } }, { id: "2", properties: { hs_name: "B" } }] });
    const result = await batchRead({ objectType: "0-970", ids: ["1", "2"], properties: ["hs_name", "buyer_name"] }, ctx);
    expect(ctx.hubspot.post).toHaveBeenCalledWith("/crm/v3/objects/0-970/batch/read", {
      inputs: [{ id: "1" }, { id: "2" }],
      properties: ["hs_name", "buyer_name"],
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(2);
  });
});
