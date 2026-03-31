import type { ToolContext } from "./types.js";

interface Association {
  to: { id: string };
  types: Array<{ associationCategory: string; associationTypeId: number }>;
}

interface CreateObjectInput {
  objectType: string;
  properties: Record<string, string>;
  associations?: Association[];
}

export async function createObject(input: CreateObjectInput, ctx: ToolContext) {
  const properties = { hubspot_owner_id: ctx.user.hubspot_owner_id, ...input.properties };
  const body: Record<string, unknown> = { properties };
  if (input.associations) { body.associations = input.associations; }
  const result = await ctx.hubspot.post(`/crm/v3/objects/${input.objectType}`, body);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
