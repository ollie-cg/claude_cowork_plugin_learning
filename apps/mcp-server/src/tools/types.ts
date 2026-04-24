import type { HubSpotClient } from "../hubspot-client.js";

export interface ToolContext {
  hubspot: HubSpotClient;
  user: {
    name: string;
    hubspot_owner_id: string;
  };
}
