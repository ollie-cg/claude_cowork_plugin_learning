import { describe, it, expect, vi } from "vitest";
import { archiveObject } from "../../tools/archive-object.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(): ToolContext {
  return { hubspot: { delete: vi.fn().mockResolvedValue(undefined) } as any, user: { name: "Danny Armstrong", hubspot_owner_id: "123456789" } };
}

describe("archiveObject", () => {
  it("calls DELETE on the correct path", async () => {
    const ctx = makeContext();
    await archiveObject({ objectType: "deals", objectId: "42" }, ctx);
    expect(ctx.hubspot.delete).toHaveBeenCalledWith("/crm/v3/objects/deals/42");
  });

  it("returns archived status with objectType and objectId", async () => {
    const ctx = makeContext();
    const result = await archiveObject({ objectType: "contacts", objectId: "99" }, ctx);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({ status: "archived", objectType: "contacts", objectId: "99" });
  });

  it("works with custom object type IDs", async () => {
    const ctx = makeContext();
    await archiveObject({ objectType: "0-970", objectId: "555" }, ctx);
    expect(ctx.hubspot.delete).toHaveBeenCalledWith("/crm/v3/objects/0-970/555");
  });
});
