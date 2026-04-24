// MCP server entry point. Express app with route groups:
//   /.well-known/* — OAuth discovery (RFC 9728 + RFC 8414)
//   /authorize — OAuth authorization code flow (browser-based consent)
//   /oauth/token — token exchange (authorization_code + client_credentials)
//   /health — health check
//   /mcp — MCP streamable HTTP transport (POST/GET/DELETE)
//
// Each MCP session gets its own McpServer instance with all 10 tools registered.
// Auth is required — the JWT from /oauth/token carries the user's name and
// hubspot_owner_id, which gets stamped on create/update operations.

import { readFileSync } from "node:fs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
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
import { archiveObject } from "./tools/archive-object.js";

// --- Config ---

interface AppConfig {
  users: UserConfig[];
  hubspotToken: string;
  jwtSecret: string;
}

// --- Authorization code store ---

interface AuthCodeEntry {
  clientId: string; // OAuth app client_id (matches token-exchange request per RFC 6749)
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  user: { client_id: string; name: string; hubspot_owner_id: string };
  expiresAt: number;
}

// In-memory store — auth codes are single-use and expire after 5 minutes
const authCodes = new Map<string, AuthCodeEntry>();

// Clean up expired codes every 60s
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodes) {
    if (entry.expiresAt < now) authCodes.delete(code);
  }
}, 60_000).unref();

function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return computed === codeChallenge;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function loginPage(query: Record<string, string>, error?: string): string {
  const appClientId = escapeAttr(query.client_id || "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in — PluginBrands HubSpot</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #111; color: #eee; display: flex; justify-content: center;
           align-items: center; min-height: 100vh; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px;
            padding: 2rem; max-width: 420px; width: 100%; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    p { color: #999; font-size: 0.9rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.85rem; color: #aaa; margin-bottom: 0.4rem; }
    input[type="text"], input[type="password"] {
           width: 100%; padding: 0.6rem 0.8rem; background: #222;
           border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 0.95rem;
           margin-bottom: 1rem; font-family: inherit; }
    input[type="text"]:focus, input[type="password"]:focus { outline: none; border-color: #666; }
    button { width: 100%; padding: 0.7rem; background: #fff; color: #000;
             border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 600;
             cursor: pointer; margin-top: 0.5rem; }
    button:hover { background: #ddd; }
    .error { background: #3a1a1a; border: 1px solid #662222; border-radius: 6px;
             padding: 0.6rem 0.8rem; margin-bottom: 1rem; color: #f88; font-size: 0.85rem; }
    .hint { color: #666; font-size: 0.75rem; margin-top: -0.5rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign in</h1>
    <p>Authorize access to PluginBrands HubSpot.</p>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="POST" action="/authorize">
      <input type="hidden" name="app_client_id" value="${appClientId}">
      <input type="hidden" name="redirect_uri" value="${escapeAttr(query.redirect_uri || "")}">
      <input type="hidden" name="code_challenge" value="${escapeAttr(query.code_challenge || "")}">
      <input type="hidden" name="code_challenge_method" value="${escapeAttr(query.code_challenge_method || "")}">
      <input type="hidden" name="state" value="${escapeAttr(query.state || "")}">
      <input type="hidden" name="scope" value="${escapeAttr(query.scope || "")}">
      <input type="hidden" name="response_type" value="${escapeAttr(query.response_type || "code")}">
      <label for="client_id">Client ID</label>
      <input type="text" id="client_id" name="client_id" placeholder="pb_yourname_..." required autofocus autocomplete="username">
      <label for="client_secret">Client Secret</label>
      <input type="password" id="client_secret" name="client_secret" placeholder="secret_..." required autocomplete="current-password">
      <p class="hint">Use the Client ID and Secret that were sent to you by your PluginBrands admin.</p>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
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

  server.tool(
    "archive_object",
    "Archive (soft-delete) a HubSpot record. Moves it to the recycle bin — recoverable for ~90 days.",
    {
      objectType: z.string().describe("Object type: 'contacts', 'companies', 'deals', or numeric ID like '0-970'"),
      objectId: z.string().describe("Record ID to archive"),
    },
    async (input) => {
      logToolCall({ user: ctx.user.name, tool: "archive_object", objectType: input.objectType, recordIds: [input.objectId] });
      return archiveObject(input, ctx);
    }
  );
}

// --- App factory (exported for testing) ---

export function createApp(config: AppConfig) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const hubspot = new HubSpotClient(config.hubspotToken);
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // --- OAuth Discovery (RFC 9728 + RFC 8414) ---

  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
    });
  });

  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      grant_types_supported: ["authorization_code", "client_credentials"],
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  // --- Health check ---
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // --- OAuth authorize endpoint (authorization_code + PKCE) ---

  app.get("/authorize", (req, res) => {
    const { response_type } = req.query as Record<string, string>;

    if (response_type !== "code") {
      res.status(400).send("Unsupported response_type. Expected 'code'.");
      return;
    }

    res.type("html").send(loginPage(req.query as Record<string, string>));
  });

  app.post("/authorize", (req, res) => {
    const {
      app_client_id,
      client_id,
      client_secret,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state,
      response_type,
    } = req.body;

    if (response_type !== "code") {
      res.status(400).send("Unsupported response_type.");
      return;
    }

    if (!redirect_uri) {
      res.status(400).send("Missing redirect_uri.");
      return;
    }

    // The user's credentials come from the form (client_id + client_secret).
    // The OAuth app identity (app_client_id) is passed through from the URL via a
    // hidden field; for direct-posts without that field, fall back to the user's
    // client_id so the token exchange still matches.
    const appClientId = app_client_id || client_id;

    const user = validateCredentials(client_id, client_secret, config.users);
    if (!user) {
      res.type("html").send(
        loginPage(req.body, "Invalid Client ID or Secret. Please try again.")
      );
      return;
    }

    const code = randomBytes(32).toString("hex");
    authCodes.set(code, {
      clientId: appClientId,
      codeChallenge: code_challenge || "",
      codeChallengeMethod: code_challenge_method || "",
      redirectUri: redirect_uri,
      user: {
        client_id: user.client_id,
        name: user.name,
        hubspot_owner_id: user.hubspot_owner_id,
      },
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(302, redirectUrl.toString());
  });

  // --- OAuth token endpoint ---
  app.post("/oauth/token", (req, res) => {
    const { grant_type } = req.body;

    // --- authorization_code grant ---
    if (grant_type === "authorization_code") {
      const { code, code_verifier, redirect_uri, client_id } = req.body;

      if (!code) {
        res.status(400).json({ error: "invalid_request", error_description: "Missing code" });
        return;
      }

      const entry = authCodes.get(code);
      if (!entry) {
        res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired code" });
        return;
      }

      // Single-use: delete immediately
      authCodes.delete(code);

      // Verify expiry
      if (entry.expiresAt < Date.now()) {
        res.status(400).json({ error: "invalid_grant", error_description: "Code expired" });
        return;
      }

      // Verify client_id matches
      if (client_id && client_id !== entry.clientId) {
        res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
        return;
      }

      // Verify redirect_uri matches
      if (redirect_uri && redirect_uri !== entry.redirectUri) {
        res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
        return;
      }

      // Verify PKCE
      if (entry.codeChallenge && entry.codeChallengeMethod === "S256") {
        if (!code_verifier) {
          res.status(400).json({ error: "invalid_grant", error_description: "Missing code_verifier" });
          return;
        }
        if (!verifyPkceS256(code_verifier, entry.codeChallenge)) {
          res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
          return;
        }
      }

      const token = issueToken(
        {
          client_id: entry.user.client_id,
          name: entry.user.name,
          hubspot_owner_id: entry.user.hubspot_owner_id,
        },
        config.jwtSecret
      );

      res.json({
        access_token: token,
        token_type: "bearer",
        expires_in: 86400,
      });
      return;
    }

    // --- client_credentials grant (original flow) ---
    if (grant_type && grant_type !== "client_credentials") {
      res.status(400).json({ error: "unsupported_grant_type" });
      return;
    }

    const { client_id, client_secret } = req.body;

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
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const wwwAuth = `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`;

      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).set("WWW-Authenticate", wwwAuth).json({
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
        res.status(401).set("WWW-Authenticate", wwwAuth).json({
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
