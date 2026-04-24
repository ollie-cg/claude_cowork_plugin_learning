import type { ToolContext } from "./types.js";

interface SearchFilter {
  propertyName: string;
  operator: string;
  value: string;
}

interface SearchInput {
  objectType: string;
  filterGroups?: Array<{ filters: SearchFilter[] }>;
  properties?: string[];
  sorts?: Array<{ propertyName: string; direction: string }>;
  limit?: number;
  after?: string;
}

export async function searchObjects(input: SearchInput, ctx: ToolContext) {
  const { objectType, ...searchBody } = input;
  const result = await ctx.hubspot.post(`/crm/v3/objects/${objectType}/search`, searchBody);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
