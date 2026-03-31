import type { ToolContext } from "./types.js";

interface BatchReadInput {
  objectType: string;
  ids: string[];
  properties?: string[];
}

export async function batchRead(input: BatchReadInput, ctx: ToolContext) {
  const body: Record<string, unknown> = { inputs: input.ids.map((id) => ({ id })) };
  if (input.properties?.length) { body.properties = input.properties; }
  const result = await ctx.hubspot.post(`/crm/v3/objects/${input.objectType}/batch/read`, body);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
