import { describe, it, expect, vi } from "vitest";
import { getAssociations } from "../../tools/get-associations.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(getResult: unknown): ToolContext {
  return { hubspot: { get: vi.fn().mockResolvedValue(getResult) } as any, user: { name: "Test User", hubspot_owner_id: "111" } };
}

describe("getAssociations", () => {
  it("fetches associations between object types", async () => {
    const ctx = makeContext({ results: [{ toObjectId: 55 }, { toObjectId: 66 }] });
    const result = await getAssociations({ objectType: "deals", objectId: "42", toObjectType: "0-970" }, ctx);
    expect(ctx.hubspot.get).toHaveBeenCalledWith("/crm/v3/objects/deals/42/associations/0-970");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(2);
  });
});
