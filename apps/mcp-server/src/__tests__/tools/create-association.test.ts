import { describe, it, expect, vi } from "vitest";
import { createAssociation } from "../../tools/create-association.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(putResult: unknown): ToolContext {
  return { hubspot: { put: vi.fn().mockResolvedValue(putResult) } as any, user: { name: "Test User", hubspot_owner_id: "111" } };
}

describe("createAssociation", () => {
  it("creates an association via v4 API", async () => {
    const ctx = makeContext({});
    const result = await createAssociation(
      { objectType: "deals", objectId: "42", toObjectType: "0-162", toObjectId: "99", associationTypeId: 795 },
      ctx
    );
    expect(ctx.hubspot.put).toHaveBeenCalledWith(
      "/crm/v4/objects/deals/42/associations/0-162/99",
      [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 795 }]
    );
    expect(result.content[0].type).toBe("text");
  });
});
