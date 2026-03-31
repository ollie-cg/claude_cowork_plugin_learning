import { describe, it, expect, vi } from "vitest";
import { updateObject } from "../../tools/update-object.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(patchResult: unknown): ToolContext {
  return { hubspot: { patch: vi.fn().mockResolvedValue(patchResult) } as any, user: { name: "Danny Armstrong", hubspot_owner_id: "123456789" } };
}

describe("updateObject", () => {
  it("patches a record with properties", async () => {
    const ctx = makeContext({ id: "42" });
    const result = await updateObject({ objectType: "deals", objectId: "42", properties: { dealstage: "4443390194" } }, ctx);
    expect(ctx.hubspot.patch).toHaveBeenCalledWith("/crm/v3/objects/deals/42", { properties: { dealstage: "4443390194" } });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe("42");
  });
});
