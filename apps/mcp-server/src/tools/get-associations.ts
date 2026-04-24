import type { ToolContext } from "./types.js";

interface GetAssociationsInput {
  objectType: string;
  objectId: string;
  toObjectType: string;
}

export async function getAssociations(input: GetAssociationsInput, ctx: ToolContext) {
  const result = await ctx.hubspot.get(`/crm/v3/objects/${input.objectType}/${input.objectId}/associations/${input.toObjectType}`);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
