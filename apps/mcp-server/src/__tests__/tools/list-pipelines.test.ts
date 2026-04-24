import { describe, it, expect, vi } from "vitest";
import { listPipelines } from "../../tools/list-pipelines.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(getResult: unknown): ToolContext {
  return { hubspot: { get: vi.fn().mockResolvedValue(getResult) } as any, user: { name: "Test User", hubspot_owner_id: "111" } };
}

describe("listPipelines", () => {
  it("fetches pipelines for an object type", async () => {
    const ctx = makeContext({ results: [{ id: "123", label: "Deal Pipeline", stages: [] }] });
    const result = await listPipelines({ objectType: "deals" }, ctx);
    expect(ctx.hubspot.get).toHaveBeenCalledWith("/crm/v3/pipelines/deals");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(1);
  });
});
