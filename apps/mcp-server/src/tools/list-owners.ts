import type { ToolContext } from "./types.js";

export async function listOwners(ctx: ToolContext) {
  const result = await ctx.hubspot.get("/crm/v3/owners");
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
