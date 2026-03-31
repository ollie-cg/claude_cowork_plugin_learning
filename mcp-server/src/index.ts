// MCP server entry point. Express app with three route groups:
//   /oauth/token — client credentials grant, returns JWT
//   /health — health check
//   /mcp — MCP streamable HTTP transport (POST/GET/DELETE)
//
// Each MCP session gets its own McpServer instance with all 9 tools registered.
// Auth is required — the JWT from /oauth/token carries the user's name and
// hubspot_owner_id, which gets stamped on create/update operations.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import {
  validateCredentials,
  issueToken,
  verifyToken,
  type UserConfig,
  type TokenPayload,
} from "./auth.js";
import { HubSpotClient } from "./hubspot-client.js";
import { logToolCall } from "./logger.js";
import type { ToolContext } from "./tools/types.js";
import { searchObjects } from "./tools/search-objects.js";
import { getObject } from "./tools/get-object.js";
import { createObject } from "./tools/create-object.js";
import { updateObject } from "./tools/update-object.js";
import { batchRead } from "./tools/batch-read.js";
import { getAssociations } from "./tools/get-associations.js";
import { createAssociation } from "./tools/create-association.js";
import { listPipelines } from "./tools/list-pipelines.js";
import { listOwners } from "./tools/list-owners.js";

// --- Config ---

interface AppConfig {
  users: UserConfig[];
  hubspotToken: string;
  jwtSecret: string;
}

// --- Tool registration ---

function registerTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    "search_objects",
    "Search any HubSpot object type with filters, sorts, and property selection. Use numeric objectTypeId for custom objects (e.g. '0-970' for Brand, '0-162' for Client Service).",
    {
      objectType: z.string().describe("Object type: 'contacts', 'companies', 'deals', or numeric ID like '0-970'"),
      filterGroups: z
        .array(
          z.object({
            filters: z.array(
              z.object({
                propertyName: z.string(),
                operator: z.string(),
                value: z.string(),
              })
            ),
          })
        )
        .optional()
        .describe("Filter groups for the search"),
      properties: z.array(z.string()).optional().describe("Properties to return"),
      sorts: z
        .array(
          z.object({
            propertyName: z.string(),
            direction: z.string(),
          })
        )
        .optional()
        .describe("Sort order"),
      limit: z.number().optional().describe("Max results (default 10, max 100)"),
      after: z.string().optional().describe("Pagination cursor"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "search_objects", objectType: input.objectType });
      return searchObjects(input, ctx);
    }
  );

  server.tool(
    "get_object",
    "Fetch a single HubSpot record by ID with specific properties.",
    {
      objectType: z.string().describe("Object type"),
      objectId: z.string().describe("Record ID"),
      properties: z.array(z.string()).optional().describe("Properties to return"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "get_object", objectType: input.objectType, recordIds: [input.objectId] });
      return getObject(input, ctx);
    }
  );

  server.tool(
    "create_object",
    "Create a HubSpot record. Automatically stamps hubspot_owner_id for user attribution.",
    {
      objectType: z.string().describe("Object type"),
      properties: z.record(z.string()).describe("Record properties"),
      associations: z
        .array(
          z.object({
            to: z.object({ id: z.string() }),
            types: z.array(
              z.object({
                associationCategory: z.string(),
                associationTypeId: z.number(),
              })
            ),
          })
        )
        .optional()
        .describe("Associations to create with the record"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "create_object", objectType: input.objectType });
      return createObject(input, ctx);
    }
  );

  server.tool(
    "update_object",
    "Update properties on an existing HubSpot record.",
    {
      objectType: z.string().describe("Object type"),
      objectId: z.string().describe("Record ID"),
      properties: z.record(z.string()).describe("Properties to update"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "update_object", objectType: input.objectType, recordIds: [input.objectId] });
      return updateObject(input, ctx);
    }
  );

  server.tool(
    "batch_read",
    "Fetch multiple HubSpot records by ID in a single call.",
    {
      objectType: z.string().describe("Object type"),
      ids: z.array(z.string()).describe("Record IDs to fetch"),
      properties: z.array(z.string()).optional().describe("Properties to return"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "batch_read", objectType: input.objectType, recordIds: input.ids });
      return batchRead(input, ctx);
    }
  );

  server.tool(
    "get_associations",
    "Get records associated to a given record. Returns IDs of associated records.",
    {
      objectType: z.string().describe("Source object type"),
      objectId: z.string().describe("Source record ID"),
      toObjectType: z.string().describe("Target object type"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "get_associations", objectType: input.objectType, recordIds: [input.objectId] });
      return getAssociations(input, ctx);
    }
  );

  server.tool(
    "create_association",
    "Link two HubSpot records with an association type.",
    {
      objectType: z.string().describe("Source object type"),
      objectId: z.string().describe("Source record ID"),
      toObjectType: z.string().describe("Target object type"),
      toObjectId: z.string().describe("Target record ID"),
      associationTypeId: z.number().describe("Association type ID (e.g. 795 for Deal to Client Service)"),
      associationCategory: z.string().optional().describe("Association category (default: HUBSPOT_DEFINED)"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "create_association", objectType: input.objectType, recordIds: [input.objectId, input.toObjectId] });
      return createAssociation(input, ctx);
    }
  );

  server.tool(
    "list_pipelines",
    "Get all pipelines and their stages for an object type.",
    {
      objectType: z.string().describe("Object type (e.g. 'deals', '0-970')"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "list_pipelines", objectType: input.objectType });
      return listPipelines(input, ctx);
    }
  );

  server.tool(
    "list_owners",
    "Get all HubSpot owners (team members).",
    {},
    async () => {
      logToolCall({ user: ctx.user.name, tool: "list_owners" });
      return listOwners(ctx);
    }
  );
}

// --- App factory (exported for testing) ---

export function createApp(config: AppConfig) {
  const app = express();
  app.use(express.json());

  const hubspot = new HubSpotClient(config.hubspotToken);
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // --- Health check ---
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // --- OAuth token endpoint ---
  app.post("/oauth/token", (req, res) => {
    const { client_id, client_secret, grant_type } = req.body;

    if (grant_type !== "client_credentials") {
      res.status(400).json({ error: "unsupported_grant_type" });
      return;
    }

    if (!client_id || !client_secret) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const user = validateCredentials(client_id, client_secret, config.users);
    if (!user) {
      res.status(401).json({ error: "invalid_client" });
      return;
    }

    const token = issueToken(
      {
        client_id: user.client_id,
        name: user.name,
        hubspot_owner_id: user.hubspot_owner_id,
      },
      config.jwtSecret
    );

    res.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 86400,
    });
  });

  // --- MCP endpoint: POST (client to server JSON-RPC) ---
  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Existing session
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // New session — must be an initialize request
    if (!sessionId && isInitializeRequest(req.body)) {
      // Extract and validate user from JWT (required)
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Authorization header required" },
          id: null,
        });
        return;
      }

      let userPayload: TokenPayload;
      try {
        userPayload = verifyToken(authHeader.slice(7), config.jwtSecret);
      } catch {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid or expired token" },
          id: null,
        });
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      const ctx: ToolContext = {
        hubspot,
        user: {
          name: userPayload.name,
          hubspot_owner_id: userPayload.hubspot_owner_id,
        },
      };

      const server = new McpServer(
        { name: "pluginbrands-hubspot", version: "1.0.0" },
        { capabilities: { logging: {} } }
      );

      registerTools(server, ctx);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad request: no valid session" },
      id: null,
    });
  });

  // --- MCP endpoint: GET (SSE stream for server notifications) ---
  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // --- MCP endpoint: DELETE (session teardown) ---
  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  return app;
}

// --- Main ---

function main() {
  const hubspotToken = process.env.HUBSPOT_TOKEN;
  if (!hubspotToken) {
    console.error("FATAL: HUBSPOT_TOKEN environment variable is required");
    process.exit(1);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("FATAL: JWT_SECRET environment variable is required");
    process.exit(1);
  }

  let users: UserConfig[];
  try {
    const raw = readFileSync(new URL("../users.json", import.meta.url), "utf-8");
    users = JSON.parse(raw).users;
  } catch (err) {
    console.error("FATAL: Cannot read users.json:", err);
    process.exit(1);
  }

  const app = createApp({ users, hubspotToken, jwtSecret });
  const port = parseInt(process.env.PORT || "3000", 10);

  app.listen(port, () => {
    console.log(`MCP server listening on port ${port}`);
    console.log(`  Users loaded: ${users.length}`);
    console.log(`  Health: http://localhost:${port}/health`);
    console.log(`  OAuth:  POST http://localhost:${port}/oauth/token`);
    console.log(`  MCP:    http://localhost:${port}/mcp`);
  });
}

// Only run main when executed directly (not imported for tests)
const isMainModule = process.argv[1] &&
  (process.argv[1].endsWith("/index.ts") ||
   process.argv[1].endsWith("/index.js"));
if (isMainModule) {
  main();
}
