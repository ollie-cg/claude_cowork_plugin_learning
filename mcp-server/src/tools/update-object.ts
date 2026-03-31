import type { ToolContext } from "./types.js";

interface UpdateObjectInput {
  objectType: string;
  objectId: string;
  properties: Record<string, string>;
}

export async function updateObject(input: UpdateObjectInput, ctx: ToolContext) {
  const properties = {
    hubspot_owner_id: ctx.user.hubspot_owner_id,
    ...input.properties,
  };
  const result = await ctx.hubspot.patch(`/crm/v3/objects/${input.objectType}/${input.objectId}`, { properties });
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
