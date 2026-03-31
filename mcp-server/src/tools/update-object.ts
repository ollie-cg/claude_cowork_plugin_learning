import type { ToolContext } from "./types.js";

interface UpdateObjectInput {
  objectType: string;
  objectId: string;
  properties: Record<string, string>;
}

export async function updateObject(input: UpdateObjectInput, ctx: ToolContext) {
  const result = await ctx.hubspot.patch(`/crm/v3/objects/${input.objectType}/${input.objectId}`, { properties: input.properties });
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
