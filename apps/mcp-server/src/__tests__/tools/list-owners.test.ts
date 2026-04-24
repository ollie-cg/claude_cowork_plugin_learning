import { describe, it, expect, vi } from "vitest";
import { listOwners } from "../../tools/list-owners.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(getResult: unknown): ToolContext {
  return { hubspot: { get: vi.fn().mockResolvedValue(getResult) } as any, user: { name: "Test User", hubspot_owner_id: "111" } };
}

describe("listOwners", () => {
  it("fetches all owners", async () => {
    const ctx = makeContext({ results: [{ id: "111", firstName: "Danny", lastName: "Armstrong" }] });
    const result = await listOwners(ctx);
    expect(ctx.hubspot.get).toHaveBeenCalledWith("/crm/v3/owners");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(1);
  });
});
