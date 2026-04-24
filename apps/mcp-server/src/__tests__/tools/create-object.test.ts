import { describe, it, expect, vi } from "vitest";
import { createObject } from "../../tools/create-object.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(postResult: unknown): ToolContext {
  return { hubspot: { post: vi.fn().mockResolvedValue(postResult) } as any, user: { name: "Danny Armstrong", hubspot_owner_id: "123456789" } };
}

describe("createObject", () => {
  it("stamps hubspot_owner_id on properties", async () => {
    const ctx = makeContext({ id: "99" });
    await createObject({ objectType: "deals", properties: { dealname: "Test Deal", pipeline: "2760762586" } }, ctx);
    expect(ctx.hubspot.post).toHaveBeenCalledWith("/crm/v3/objects/deals", {
      properties: { dealname: "Test Deal", pipeline: "2760762586", hubspot_owner_id: "123456789" },
    });
  });

  it("passes associations when provided", async () => {
    const ctx = makeContext({ id: "99" });
    await createObject({
      objectType: "deals",
      properties: { dealname: "Test" },
      associations: [{ to: { id: "55" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }] }],
    }, ctx);
    expect(ctx.hubspot.post).toHaveBeenCalledWith("/crm/v3/objects/deals", {
      properties: expect.objectContaining({ hubspot_owner_id: "123456789" }),
      associations: [{ to: { id: "55" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }] }],
    });
  });

  it("does not overwrite explicit hubspot_owner_id", async () => {
    const ctx = makeContext({ id: "99" });
    await createObject({ objectType: "contacts", properties: { firstname: "Jane", hubspot_owner_id: "override" } }, ctx);
    const call = (ctx.hubspot.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].properties.hubspot_owner_id).toBe("override");
  });
});
