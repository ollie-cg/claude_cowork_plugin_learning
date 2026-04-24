// apps/mcp-server/src/cli/add-user.ts
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { hashSync } from "bcryptjs";
import { parseArgs } from "node:util";

interface UsersFile {
  users: Array<{
    client_id: string;
    client_secret_hash: string;
    name: string;
    hubspot_owner_id: string;
  }>;
}

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    "hubspot-owner-id": { type: "string" },
  },
});

if (!values.name || !values["hubspot-owner-id"]) {
  console.error("Usage: npm run add-user -- --name 'Danny Armstrong' --hubspot-owner-id 123456789");
  process.exit(1);
}

const usersPath = new URL("../../users.json", import.meta.url);
const data: UsersFile = JSON.parse(readFileSync(usersPath, "utf-8"));

// Generate credentials
const suffix = randomBytes(6).toString("hex");
const clientId = `pb_${values.name.toLowerCase().split(" ")[0]}_${suffix}`;
const clientSecret = `secret_${randomBytes(16).toString("hex")}`;
const secretHash = hashSync(clientSecret, 10);

data.users.push({
  client_id: clientId,
  client_secret_hash: secretHash,
  name: values.name,
  hubspot_owner_id: values["hubspot-owner-id"],
});

writeFileSync(usersPath, JSON.stringify(data, null, 2) + "\n");

console.log("\nUser added successfully!\n");
console.log("  Name:              ", values.name);
console.log("  HubSpot Owner ID:  ", values["hubspot-owner-id"]);
console.log("  Client ID:         ", clientId);
console.log("  Client Secret:     ", clientSecret);
console.log("\n  Share the Client ID and Secret with this team member.");
console.log("  The secret is stored hashed — this is the only time it's shown.\n");
