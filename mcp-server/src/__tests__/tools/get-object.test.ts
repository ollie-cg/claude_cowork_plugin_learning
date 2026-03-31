import { describe, it, expect, vi } from "vitest";
import { getObject } from "../../tools/get-object.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(getResult: unknown): ToolContext {
  return { hubspot: { get: vi.fn().mockResolvedValue(getResult) } as any, user: { name: "Test User", hubspot_owner_id: "111" } };
}

describe("getObject", () => {
  it("fetches a record by ID with properties", async () => {
    const ctx = makeContext({ id: "42", properties: { hs_name: "MOJU" } });
    const result = await getObject({ objectType: "0-162", objectId: "42", properties: ["hs_name"] }, ctx);
    expect(ctx.hubspot.get).toHaveBeenCalledWith("/crm/v3/objects/0-162/42", { properties: "hs_name" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe("42");
  });

  it("works without properties param", async () => {
    const ctx = makeContext({ id: "42", properties: {} });
    await getObject({ objectType: "contacts", objectId: "42" }, ctx);
    expect(ctx.hubspot.get).toHaveBeenCalledWith("/crm/v3/objects/contacts/42", {});
  });
});
