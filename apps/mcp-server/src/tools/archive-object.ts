// Archives (soft-deletes) a HubSpot record via DELETE /crm/v3/objects/{type}/{id}.
// The record moves to HubSpot's recycle bin and is recoverable for ~90 days.

import type { ToolContext } from "./types.js";

interface ArchiveObjectInput {
  objectType: string;
  objectId: string;
}

export async function archiveObject(input: ArchiveObjectInput, ctx: ToolContext) {
  await ctx.hubspot.delete(`/crm/v3/objects/${input.objectType}/${input.objectId}`);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "archived",
          objectType: input.objectType,
          objectId: input.objectId,
        }),
      },
    ],
  };
}
