// Links two HubSpot records via the v4 associations API.
// Uses v4 (not v3) because v4 supports labelled association types,
// which are needed for custom object associations like Deal -> Client Service (type 795).

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
