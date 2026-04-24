import type { ToolContext } from "./types.js";

interface GetObjectInput {
  objectType: string;
  objectId: string;
  properties?: string[];
}

export async function getObject(input: GetObjectInput, ctx: ToolContext) {
  const params: Record<string, string> = {};
  if (input.properties?.length) {
    params.properties = input.properties.join(",");
  }
  const result = await ctx.hubspot.get(`/crm/v3/objects/${input.objectType}/${input.objectId}`, params);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
