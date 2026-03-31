import type { ToolContext } from "./types.js";

interface CreateAssociationInput {
  objectType: string;
  objectId: string;
  toObjectType: string;
  toObjectId: string;
  associationTypeId: number;
  associationCategory?: string;
}

export async function createAssociation(input: CreateAssociationInput, ctx: ToolContext) {
  const result = await ctx.hubspot.put(
    `/crm/v4/objects/${input.objectType}/${input.objectId}/associations/${input.toObjectType}/${input.toObjectId}`,
    [{ associationCategory: input.associationCategory ?? "HUBSPOT_DEFINED", associationTypeId: input.associationTypeId }]
  );
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
