import type { ToolContext } from "./types.js";

interface ListPipelinesInput {
  objectType: string;
}

export async function listPipelines(input: ListPipelinesInput, ctx: ToolContext) {
  const result = await ctx.hubspot.get(`/crm/v3/pipelines/${input.objectType}`);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
