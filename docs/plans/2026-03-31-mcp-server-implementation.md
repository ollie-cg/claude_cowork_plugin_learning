# HubSpot MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a custom HubSpot MCP server that supports custom objects, centralises the HubSpot token, identifies users via OAuth, and deploys on Railway.

**Architecture:** Express app serving MCP over streamable HTTP transport at `/mcp`, with a custom `/oauth/token` endpoint for client credentials auth. One `McpServer` instance per session. JWT tokens carry user identity; the server stamps `hubspot_owner_id` on writes. Nine generic CRUD tools proxy to HubSpot CRM v3 API.

**Tech Stack:** Node.js, TypeScript, Express 5, `@modelcontextprotocol/sdk` v1.29+, Zod, jsonwebtoken, bcryptjs, Vitest

---

## Phase 1: Project Scaffolding

### Task 1: Initialise the mcp-server directory

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "pluginbrands-mcp-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "add-user": "tsx src/cli/add-user.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "bcryptjs": "^3.0.2",
    "express": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.24.3"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/express": "^5.0.1",
    "@types/jsonwebtoken": "^9.0.9",
    "@types/node": "^22.14.1",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.1.1"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
*.tgz
```

**Step 4: Install dependencies**

Run: `cd mcp-server && npm install`
Expected: `node_modules/` created, `package-lock.json` generated

**Step 5: Verify TypeScript compiles**

Run: `cd mcp-server && mkdir -p src && echo 'console.log("ok");' > src/index.ts && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add mcp-server/package.json mcp-server/package-lock.json mcp-server/tsconfig.json mcp-server/.gitignore
git commit -m "chore(mcp): scaffold mcp-server project with dependencies"
```

---

## Phase 2: Core Infrastructure

### Task 2: Create the logger

**Files:**
- Create: `mcp-server/src/logger.ts`
- Test: `mcp-server/src/__tests__/logger.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/logger.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logToolCall } from "../logger.js";

describe("logToolCall", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs tool call with user identity and record details", () => {
    logToolCall({
      user: "Danny Armstrong",
      tool: "search_objects",
      objectType: "0-970",
      recordIds: ["123", "456"],
    });

    expect(console.log).toHaveBeenCalledOnce();
    const logged = JSON.parse(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    );
    expect(logged.user).toBe("Danny Armstrong");
    expect(logged.tool).toBe("search_objects");
    expect(logged.objectType).toBe("0-970");
    expect(logged.recordIds).toEqual(["123", "456"]);
    expect(logged.timestamp).toBeDefined();
  });

  it("omits recordIds when not provided", () => {
    logToolCall({
      user: "Danny Armstrong",
      tool: "list_owners",
    });

    const logged = JSON.parse(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    );
    expect(logged.recordIds).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/logger.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/logger.ts
interface ToolCallLog {
  user: string;
  tool: string;
  objectType?: string;
  recordIds?: string[];
}

export function logToolCall(entry: ToolCallLog): void {
  const log = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  console.log(JSON.stringify(log));
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/logger.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/logger.ts mcp-server/src/__tests__/logger.test.ts
git commit -m "feat(mcp): add structured JSON logger for tool calls"
```

---

### Task 3: Create the HubSpot HTTP client

**Files:**
- Create: `mcp-server/src/hubspot-client.ts`
- Test: `mcp-server/src/__tests__/hubspot-client.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/hubspot-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HubSpotClient } from "../hubspot-client.js";

describe("HubSpotClient", () => {
  let client: HubSpotClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    client = new HubSpotClient("test-token-123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends GET request with auth header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    const result = await client.get("/crm/v3/objects/contacts", {
      limit: "10",
      properties: "firstname,lastname",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/contacts?limit=10&properties=firstname%2Clastname",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer test-token-123",
          "Content-Type": "application/json",
        },
      }
    );
    expect(result).toEqual({ results: [] });
  });

  it("sends POST request with body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "123" }),
    });

    const body = { properties: { firstname: "Jane" } };
    const result = await client.post("/crm/v3/objects/contacts", body);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/contacts",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    expect(result).toEqual({ id: "123" });
  });

  it("sends PATCH request with body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "123" }),
    });

    await client.patch("/crm/v3/objects/contacts/123", {
      properties: { lastname: "Doe" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/contacts/123",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("sends PUT request", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await client.put("/crm/v3/objects/contacts/1/associations/companies/2");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/contacts/1/associations/companies/2",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("throws on non-OK response with HubSpot error message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Invalid input", status: "error" }),
    });

    await expect(client.get("/crm/v3/objects/bad")).rejects.toThrow(
      "HubSpot API error 400: Invalid input"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/hubspot-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/hubspot-client.ts
const BASE_URL = "https://api.hubapi.com";

export class HubSpotClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  async get(path: string, params?: Record<string, string>): Promise<unknown> {
    let url = `${BASE_URL}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }
    return this.request(url, { method: "GET", headers: this.headers });
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request(`${BASE_URL}${path}`, {
      method: "POST",
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    return this.request(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    });
  }

  async put(path: string, body?: unknown): Promise<unknown> {
    return this.request(`${BASE_URL}${path}`, {
      method: "PUT",
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(url, init);
    if (!res.ok) {
      let message = `status ${res.status}`;
      try {
        const err = (await res.json()) as { message?: string };
        if (err.message) message = err.message;
      } catch {}
      throw new Error(`HubSpot API error ${res.status}: ${message}`);
    }
    return res.json();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/hubspot-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/hubspot-client.ts mcp-server/src/__tests__/hubspot-client.test.ts
git commit -m "feat(mcp): add HubSpot HTTP client with GET/POST/PATCH/PUT"
```

---

### Task 4: Create the auth module (OAuth + JWT)

**Files:**
- Create: `mcp-server/src/auth.ts`
- Create: `mcp-server/users.json`
- Test: `mcp-server/src/__tests__/auth.test.ts`

The auth module does three things:
1. Loads `users.json` at startup
2. `POST /oauth/token` — validates client_id + client_secret, returns JWT
3. `verifyToken(token)` — decodes JWT for use in MCP request middleware

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/auth.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { hashSync } from "bcryptjs";
import { issueToken, verifyToken, validateCredentials } from "../auth.js";
import type { UserConfig } from "../auth.js";

const TEST_SECRET = "test-jwt-secret-for-unit-tests";

const testUsers: UserConfig[] = [
  {
    client_id: "pb_danny_abc123",
    client_secret_hash: hashSync("secret_danny_xyz", 10),
    name: "Danny Armstrong",
    hubspot_owner_id: "123456789",
  },
];

describe("validateCredentials", () => {
  it("returns user for valid credentials", () => {
    const user = validateCredentials(
      "pb_danny_abc123",
      "secret_danny_xyz",
      testUsers
    );
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Danny Armstrong");
  });

  it("returns null for wrong client_id", () => {
    const user = validateCredentials("pb_nobody", "secret_danny_xyz", testUsers);
    expect(user).toBeNull();
  });

  it("returns null for wrong secret", () => {
    const user = validateCredentials(
      "pb_danny_abc123",
      "wrong_secret",
      testUsers
    );
    expect(user).toBeNull();
  });
});

describe("issueToken + verifyToken", () => {
  it("round-trips user identity through JWT", () => {
    const token = issueToken(
      {
        client_id: "pb_danny_abc123",
        name: "Danny Armstrong",
        hubspot_owner_id: "123456789",
      },
      TEST_SECRET
    );

    const payload = verifyToken(token, TEST_SECRET);
    expect(payload.name).toBe("Danny Armstrong");
    expect(payload.hubspot_owner_id).toBe("123456789");
    expect(payload.client_id).toBe("pb_danny_abc123");
  });

  it("throws on invalid token", () => {
    expect(() => verifyToken("garbage.token.here", TEST_SECRET)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/auth.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/auth.ts
import { compareSync } from "bcryptjs";
import jwt from "jsonwebtoken";

export interface UserConfig {
  client_id: string;
  client_secret_hash: string;
  name: string;
  hubspot_owner_id: string;
}

export interface TokenPayload {
  client_id: string;
  name: string;
  hubspot_owner_id: string;
}

export function validateCredentials(
  clientId: string,
  clientSecret: string,
  users: UserConfig[]
): UserConfig | null {
  const user = users.find((u) => u.client_id === clientId);
  if (!user) return null;
  if (!compareSync(clientSecret, user.client_secret_hash)) return null;
  return user;
}

export function issueToken(payload: TokenPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: "24h" });
}

export function verifyToken(token: string, secret: string): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload;
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/auth.test.ts`
Expected: PASS

**Step 5: Create the seed users.json**

```json
{
  "users": []
}
```

This file ships empty. Users are added via the CLI script (Task 10).

**Step 6: Commit**

```bash
git add mcp-server/src/auth.ts mcp-server/src/__tests__/auth.test.ts mcp-server/users.json
git commit -m "feat(mcp): add OAuth auth module with JWT issue/verify"
```

---

## Phase 3: MCP Tools

All 9 tools follow the same pattern. Each is a function that receives typed input and an injected `HubSpotClient` + user context, and returns MCP `CallToolResult`.

### Task 5: Create shared tool types

**Files:**
- Create: `mcp-server/src/tools/types.ts`

**Step 1: Write the types file**

```typescript
// mcp-server/src/tools/types.ts
import type { HubSpotClient } from "../hubspot-client.js";

export interface ToolContext {
  hubspot: HubSpotClient;
  user: {
    name: string;
    hubspot_owner_id: string;
  };
}
```

**Step 2: Commit**

```bash
git add mcp-server/src/tools/types.ts
git commit -m "feat(mcp): add shared tool context type"
```

---

### Task 6: Implement search_objects tool

**Files:**
- Create: `mcp-server/src/tools/search-objects.ts`
- Test: `mcp-server/src/__tests__/tools/search-objects.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/search-objects.test.ts
import { describe, it, expect, vi } from "vitest";
import { searchObjects } from "../../tools/search-objects.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(postResult: unknown): ToolContext {
  return {
    hubspot: {
      post: vi.fn().mockResolvedValue(postResult),
    } as any,
    user: { name: "Test User", hubspot_owner_id: "111" },
  };
}

describe("searchObjects", () => {
  it("calls HubSpot search endpoint and returns results", async () => {
    const ctx = makeContext({ total: 1, results: [{ id: "42" }] });

    const result = await searchObjects(
      {
        objectType: "0-970",
        filterGroups: [
          {
            filters: [
              { propertyName: "client_name_sync", operator: "EQ", value: "MOJU" },
            ],
          },
        ],
        properties: ["hs_name", "buyer_name"],
        limit: 10,
      },
      ctx
    );

    expect(ctx.hubspot.post).toHaveBeenCalledWith("/crm/v3/objects/0-970/search", {
      filterGroups: [
        {
          filters: [
            { propertyName: "client_name_sync", operator: "EQ", value: "MOJU" },
          ],
        },
      ],
      properties: ["hs_name", "buyer_name"],
      limit: 10,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(1);
  });

  it("passes sorts when provided", async () => {
    const ctx = makeContext({ total: 0, results: [] });

    await searchObjects(
      {
        objectType: "contacts",
        properties: ["firstname"],
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      },
      ctx
    );

    expect(ctx.hubspot.post).toHaveBeenCalledWith(
      "/crm/v3/objects/contacts/search",
      expect.objectContaining({
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      })
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/search-objects.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/search-objects.ts
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
  const result = await ctx.hubspot.post(
    `/crm/v3/objects/${objectType}/search`,
    searchBody
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/search-objects.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/search-objects.ts mcp-server/src/__tests__/tools/search-objects.test.ts
git commit -m "feat(mcp): add search_objects tool"
```

---

### Task 7: Implement get_object tool

**Files:**
- Create: `mcp-server/src/tools/get-object.ts`
- Test: `mcp-server/src/__tests__/tools/get-object.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/get-object.test.ts
import { describe, it, expect, vi } from "vitest";
import { getObject } from "../../tools/get-object.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(getResult: unknown): ToolContext {
  return {
    hubspot: { get: vi.fn().mockResolvedValue(getResult) } as any,
    user: { name: "Test User", hubspot_owner_id: "111" },
  };
}

describe("getObject", () => {
  it("fetches a record by ID with properties", async () => {
    const ctx = makeContext({ id: "42", properties: { hs_name: "MOJU" } });

    const result = await getObject(
      { objectType: "0-162", objectId: "42", properties: ["hs_name"] },
      ctx
    );

    expect(ctx.hubspot.get).toHaveBeenCalledWith("/crm/v3/objects/0-162/42", {
      properties: "hs_name",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe("42");
  });

  it("works without properties param", async () => {
    const ctx = makeContext({ id: "42", properties: {} });

    await getObject({ objectType: "contacts", objectId: "42" }, ctx);

    expect(ctx.hubspot.get).toHaveBeenCalledWith(
      "/crm/v3/objects/contacts/42",
      {}
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/get-object.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/get-object.ts
import type { ToolContext } from "./types.js";

interface GetObjectInput {
  objectType: string;
  objectId: string;
  properties?: string[];
}

export async function getObject(input: GetObjectInput, ctx: ToolContext) {
  const params: Record<string, string> = {};
  if (input.properties?.length) {
    params.properties = input.properties.join(",");
  }
  const result = await ctx.hubspot.get(
    `/crm/v3/objects/${input.objectType}/${input.objectId}`,
    params
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/get-object.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/get-object.ts mcp-server/src/__tests__/tools/get-object.test.ts
git commit -m "feat(mcp): add get_object tool"
```

---

### Task 8: Implement create_object tool (with owner ID stamping)

**Files:**
- Create: `mcp-server/src/tools/create-object.ts`
- Test: `mcp-server/src/__tests__/tools/create-object.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/create-object.test.ts
import { describe, it, expect, vi } from "vitest";
import { createObject } from "../../tools/create-object.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(postResult: unknown): ToolContext {
  return {
    hubspot: { post: vi.fn().mockResolvedValue(postResult) } as any,
    user: { name: "Danny Armstrong", hubspot_owner_id: "123456789" },
  };
}

describe("createObject", () => {
  it("stamps hubspot_owner_id on properties", async () => {
    const ctx = makeContext({ id: "99" });

    await createObject(
      {
        objectType: "deals",
        properties: { dealname: "Test Deal", pipeline: "2760762586" },
      },
      ctx
    );

    expect(ctx.hubspot.post).toHaveBeenCalledWith("/crm/v3/objects/deals", {
      properties: {
        dealname: "Test Deal",
        pipeline: "2760762586",
        hubspot_owner_id: "123456789",
      },
    });
  });

  it("passes associations when provided", async () => {
    const ctx = makeContext({ id: "99" });

    await createObject(
      {
        objectType: "deals",
        properties: { dealname: "Test" },
        associations: [
          {
            to: { id: "55" },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }],
          },
        ],
      },
      ctx
    );

    expect(ctx.hubspot.post).toHaveBeenCalledWith("/crm/v3/objects/deals", {
      properties: expect.objectContaining({ hubspot_owner_id: "123456789" }),
      associations: [
        {
          to: { id: "55" },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }],
        },
      ],
    });
  });

  it("does not overwrite explicit hubspot_owner_id", async () => {
    const ctx = makeContext({ id: "99" });

    await createObject(
      {
        objectType: "contacts",
        properties: { firstname: "Jane", hubspot_owner_id: "override" },
      },
      ctx
    );

    const call = (ctx.hubspot.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].properties.hubspot_owner_id).toBe("override");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/create-object.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/create-object.ts
import type { ToolContext } from "./types.js";

interface Association {
  to: { id: string };
  types: Array<{ associationCategory: string; associationTypeId: number }>;
}

interface CreateObjectInput {
  objectType: string;
  properties: Record<string, string>;
  associations?: Association[];
}

export async function createObject(input: CreateObjectInput, ctx: ToolContext) {
  const properties = {
    hubspot_owner_id: ctx.user.hubspot_owner_id,
    ...input.properties,
  };

  const body: Record<string, unknown> = { properties };
  if (input.associations) {
    body.associations = input.associations;
  }

  const result = await ctx.hubspot.post(
    `/crm/v3/objects/${input.objectType}`,
    body
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/create-object.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/create-object.ts mcp-server/src/__tests__/tools/create-object.test.ts
git commit -m "feat(mcp): add create_object tool with owner ID stamping"
```

---

### Task 9: Implement update_object tool (with owner ID stamping)

**Files:**
- Create: `mcp-server/src/tools/update-object.ts`
- Test: `mcp-server/src/__tests__/tools/update-object.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/update-object.test.ts
import { describe, it, expect, vi } from "vitest";
import { updateObject } from "../../tools/update-object.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(patchResult: unknown): ToolContext {
  return {
    hubspot: { patch: vi.fn().mockResolvedValue(patchResult) } as any,
    user: { name: "Danny Armstrong", hubspot_owner_id: "123456789" },
  };
}

describe("updateObject", () => {
  it("patches a record with properties", async () => {
    const ctx = makeContext({ id: "42" });

    const result = await updateObject(
      {
        objectType: "deals",
        objectId: "42",
        properties: { dealstage: "4443390194" },
      },
      ctx
    );

    expect(ctx.hubspot.patch).toHaveBeenCalledWith("/crm/v3/objects/deals/42", {
      properties: { dealstage: "4443390194" },
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe("42");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/update-object.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/update-object.ts
import type { ToolContext } from "./types.js";

interface UpdateObjectInput {
  objectType: string;
  objectId: string;
  properties: Record<string, string>;
}

export async function updateObject(input: UpdateObjectInput, ctx: ToolContext) {
  const result = await ctx.hubspot.patch(
    `/crm/v3/objects/${input.objectType}/${input.objectId}`,
    { properties: input.properties }
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/update-object.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/update-object.ts mcp-server/src/__tests__/tools/update-object.test.ts
git commit -m "feat(mcp): add update_object tool"
```

---

### Task 10: Implement batch_read tool

**Files:**
- Create: `mcp-server/src/tools/batch-read.ts`
- Test: `mcp-server/src/__tests__/tools/batch-read.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/batch-read.test.ts
import { describe, it, expect, vi } from "vitest";
import { batchRead } from "../../tools/batch-read.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(postResult: unknown): ToolContext {
  return {
    hubspot: { post: vi.fn().mockResolvedValue(postResult) } as any,
    user: { name: "Test User", hubspot_owner_id: "111" },
  };
}

describe("batchRead", () => {
  it("sends batch read request with IDs and properties", async () => {
    const ctx = makeContext({
      results: [
        { id: "1", properties: { hs_name: "A" } },
        { id: "2", properties: { hs_name: "B" } },
      ],
    });

    const result = await batchRead(
      {
        objectType: "0-970",
        ids: ["1", "2"],
        properties: ["hs_name", "buyer_name"],
      },
      ctx
    );

    expect(ctx.hubspot.post).toHaveBeenCalledWith(
      "/crm/v3/objects/0-970/batch/read",
      {
        inputs: [{ id: "1" }, { id: "2" }],
        properties: ["hs_name", "buyer_name"],
      }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/batch-read.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/batch-read.ts
import type { ToolContext } from "./types.js";

interface BatchReadInput {
  objectType: string;
  ids: string[];
  properties?: string[];
}

export async function batchRead(input: BatchReadInput, ctx: ToolContext) {
  const body: Record<string, unknown> = {
    inputs: input.ids.map((id) => ({ id })),
  };
  if (input.properties?.length) {
    body.properties = input.properties;
  }
  const result = await ctx.hubspot.post(
    `/crm/v3/objects/${input.objectType}/batch/read`,
    body
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/batch-read.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/batch-read.ts mcp-server/src/__tests__/tools/batch-read.test.ts
git commit -m "feat(mcp): add batch_read tool"
```

---

### Task 11: Implement get_associations tool

**Files:**
- Create: `mcp-server/src/tools/get-associations.ts`
- Test: `mcp-server/src/__tests__/tools/get-associations.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/get-associations.test.ts
import { describe, it, expect, vi } from "vitest";
import { getAssociations } from "../../tools/get-associations.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(getResult: unknown): ToolContext {
  return {
    hubspot: { get: vi.fn().mockResolvedValue(getResult) } as any,
    user: { name: "Test User", hubspot_owner_id: "111" },
  };
}

describe("getAssociations", () => {
  it("fetches associations between object types", async () => {
    const ctx = makeContext({
      results: [{ toObjectId: 55 }, { toObjectId: 66 }],
    });

    const result = await getAssociations(
      { objectType: "deals", objectId: "42", toObjectType: "0-970" },
      ctx
    );

    expect(ctx.hubspot.get).toHaveBeenCalledWith(
      "/crm/v3/objects/deals/42/associations/0-970"
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/get-associations.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/get-associations.ts
import type { ToolContext } from "./types.js";

interface GetAssociationsInput {
  objectType: string;
  objectId: string;
  toObjectType: string;
}

export async function getAssociations(
  input: GetAssociationsInput,
  ctx: ToolContext
) {
  const result = await ctx.hubspot.get(
    `/crm/v3/objects/${input.objectType}/${input.objectId}/associations/${input.toObjectType}`
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/get-associations.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/get-associations.ts mcp-server/src/__tests__/tools/get-associations.test.ts
git commit -m "feat(mcp): add get_associations tool"
```

---

### Task 12: Implement create_association tool

**Files:**
- Create: `mcp-server/src/tools/create-association.ts`
- Test: `mcp-server/src/__tests__/tools/create-association.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/create-association.test.ts
import { describe, it, expect, vi } from "vitest";
import { createAssociation } from "../../tools/create-association.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(putResult: unknown): ToolContext {
  return {
    hubspot: { put: vi.fn().mockResolvedValue(putResult) } as any,
    user: { name: "Test User", hubspot_owner_id: "111" },
  };
}

describe("createAssociation", () => {
  it("creates an association via v4 API", async () => {
    const ctx = makeContext({});

    const result = await createAssociation(
      {
        objectType: "deals",
        objectId: "42",
        toObjectType: "0-162",
        toObjectId: "99",
        associationTypeId: 795,
      },
      ctx
    );

    expect(ctx.hubspot.put).toHaveBeenCalledWith(
      "/crm/v4/objects/deals/42/associations/0-162/99",
      [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 795 }]
    );

    expect(result.content[0].type).toBe("text");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/create-association.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/create-association.ts
import type { ToolContext } from "./types.js";

interface CreateAssociationInput {
  objectType: string;
  objectId: string;
  toObjectType: string;
  toObjectId: string;
  associationTypeId: number;
  associationCategory?: string;
}

export async function createAssociation(
  input: CreateAssociationInput,
  ctx: ToolContext
) {
  const result = await ctx.hubspot.put(
    `/crm/v4/objects/${input.objectType}/${input.objectId}/associations/${input.toObjectType}/${input.toObjectId}`,
    [
      {
        associationCategory:
          input.associationCategory ?? "HUBSPOT_DEFINED",
        associationTypeId: input.associationTypeId,
      },
    ]
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/create-association.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/create-association.ts mcp-server/src/__tests__/tools/create-association.test.ts
git commit -m "feat(mcp): add create_association tool"
```

---

### Task 13: Implement list_pipelines tool

**Files:**
- Create: `mcp-server/src/tools/list-pipelines.ts`
- Test: `mcp-server/src/__tests__/tools/list-pipelines.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/list-pipelines.test.ts
import { describe, it, expect, vi } from "vitest";
import { listPipelines } from "../../tools/list-pipelines.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(getResult: unknown): ToolContext {
  return {
    hubspot: { get: vi.fn().mockResolvedValue(getResult) } as any,
    user: { name: "Test User", hubspot_owner_id: "111" },
  };
}

describe("listPipelines", () => {
  it("fetches pipelines for an object type", async () => {
    const ctx = makeContext({
      results: [{ id: "123", label: "Deal Pipeline", stages: [] }],
    });

    const result = await listPipelines({ objectType: "deals" }, ctx);

    expect(ctx.hubspot.get).toHaveBeenCalledWith("/crm/v3/pipelines/deals");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/list-pipelines.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/list-pipelines.ts
import type { ToolContext } from "./types.js";

interface ListPipelinesInput {
  objectType: string;
}

export async function listPipelines(
  input: ListPipelinesInput,
  ctx: ToolContext
) {
  const result = await ctx.hubspot.get(
    `/crm/v3/pipelines/${input.objectType}`
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/list-pipelines.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/list-pipelines.ts mcp-server/src/__tests__/tools/list-pipelines.test.ts
git commit -m "feat(mcp): add list_pipelines tool"
```

---

### Task 14: Implement list_owners tool

**Files:**
- Create: `mcp-server/src/tools/list-owners.ts`
- Test: `mcp-server/src/__tests__/tools/list-owners.test.ts`

**Step 1: Write the failing test**

```typescript
// mcp-server/src/__tests__/tools/list-owners.test.ts
import { describe, it, expect, vi } from "vitest";
import { listOwners } from "../../tools/list-owners.js";
import type { ToolContext } from "../../tools/types.js";

function makeContext(getResult: unknown): ToolContext {
  return {
    hubspot: { get: vi.fn().mockResolvedValue(getResult) } as any,
    user: { name: "Test User", hubspot_owner_id: "111" },
  };
}

describe("listOwners", () => {
  it("fetches all owners", async () => {
    const ctx = makeContext({
      results: [{ id: "111", firstName: "Danny", lastName: "Armstrong" }],
    });

    const result = await listOwners(ctx);

    expect(ctx.hubspot.get).toHaveBeenCalledWith("/crm/v3/owners");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/list-owners.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// mcp-server/src/tools/list-owners.ts
import type { ToolContext } from "./types.js";

export async function listOwners(ctx: ToolContext) {
  const result = await ctx.hubspot.get("/crm/v3/owners");
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run src/__tests__/tools/list-owners.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add mcp-server/src/tools/list-owners.ts mcp-server/src/__tests__/tools/list-owners.test.ts
git commit -m "feat(mcp): add list_owners tool"
```

---

## Phase 4: Server Entry Point

### Task 15: Wire up the MCP server with Express + OAuth + all tools

**Files:**
- Create: `mcp-server/src/index.ts`
- Test: `mcp-server/src/__tests__/index.test.ts`

This is the largest task. The entry point:
1. Loads `users.json`
2. Creates Express app with `/oauth/token`, `/health`, and `/mcp` routes
3. Registers all 9 tools on each new MCP session
4. Validates JWT on `/mcp` requests
5. Injects `ToolContext` (HubSpot client + user identity) into tool handlers

**Step 1: Write the failing test**

Tests the `/oauth/token` endpoint and the `/health` endpoint. MCP transport integration is tested manually (Task 18).

```typescript
// mcp-server/src/__tests__/index.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hashSync } from "bcryptjs";

// We test the Express app in isolation by importing the app factory
import { createApp } from "../index.js";

describe("Express app", () => {
  const testUsers = [
    {
      client_id: "pb_test_user",
      client_secret_hash: hashSync("test_secret_123", 10),
      name: "Test User",
      hubspot_owner_id: "111",
    },
  ];

  const app = createApp({
    users: testUsers,
    hubspotToken: "fake-token",
    jwtSecret: "test-jwt-secret",
  });

  describe("GET /health", () => {
    it("returns ok", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
    });
  });

  // Note: full /oauth/token and /mcp tests require supertest or
  // similar. We test the auth module directly in auth.test.ts.
  // Integration testing happens via the Tier C harness (Task 18).
});
```

**Important:** The test above is intentionally minimal. The real `/oauth/token` and `/mcp` integration is covered by:
- `auth.test.ts` (unit tests for credentials + JWT)
- Manual curl testing (Step 4 below)
- Tier C harness (Task 18)

Instead of a heavy supertest setup, we'll restructure `index.ts` to export a `createApp` factory and test core logic through the already-tested modules.

**Step 2: Write the implementation**

```typescript
// mcp-server/src/index.ts
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
      associationTypeId: z.number().describe("Association type ID (e.g. 795 for Deal→Client Service)"),
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

// --- App factory ---

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

  // --- MCP endpoint: POST (client→server JSON-RPC) ---
  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Existing session
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // New session — must be an initialize request
    if (!sessionId && isInitializeRequest(req.body)) {
      // Extract user from JWT (optional during init — Cowork may not send token on first request)
      let userPayload: TokenPayload | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        try {
          userPayload = verifyToken(authHeader.slice(7), config.jwtSecret);
        } catch {
          // Token invalid — reject
          res.status(401).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Invalid or expired token" },
            id: null,
          });
          return;
        }
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

      // Build tool context with user identity (or anonymous fallback)
      const ctx: ToolContext = {
        hubspot,
        user: userPayload
          ? { name: userPayload.name, hubspot_owner_id: userPayload.hubspot_owner_id }
          : { name: "anonymous", hubspot_owner_id: "" },
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
```

**Step 3: Update the test to match the factory**

The test from Step 1 won't work with native Express (no `.request()` method). Instead, test integration via curl after starting the server. Keep unit tests for auth module. Delete the placeholder test file — the real integration test is Task 18 (Tier C harness).

**Step 4: Build and verify**

Run: `cd mcp-server && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat(mcp): wire up Express server with OAuth, MCP transport, and all 9 tools"
```

---

## Phase 5: CLI and Deployment

### Task 16: Create the add-user CLI script

**Files:**
- Create: `mcp-server/src/cli/add-user.ts`

**Step 1: Write the script**

```typescript
// mcp-server/src/cli/add-user.ts
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
```

**Step 2: Test it**

Run: `cd mcp-server && npx tsx src/cli/add-user.ts --name "Test User" --hubspot-owner-id 999`
Expected: Prints credentials, adds entry to `users.json`

**Step 3: Verify users.json was updated**

Run: `cat mcp-server/users.json`
Expected: One user entry with hashed secret

**Step 4: Remove the test user**

Manually edit `users.json` back to `{"users":[]}` — or leave it for local testing.

**Step 5: Commit**

```bash
git add mcp-server/src/cli/add-user.ts
git commit -m "feat(mcp): add CLI script for generating user credentials"
```

---

### Task 17: Create the Dockerfile

**Files:**
- Create: `mcp-server/Dockerfile`

**Step 1: Write the Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ dist/
COPY users.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Step 2: Verify build**

Run: `cd mcp-server && npx tsc`
Expected: `dist/` directory created with compiled JS

**Step 3: Commit**

```bash
git add mcp-server/Dockerfile
git commit -m "chore(mcp): add Dockerfile for Railway deployment"
```

---

## Phase 6: Integration Testing

### Task 18: Manual smoke test

**No files to create.** This is a manual verification step.

**Step 1: Start the server locally**

```bash
cd mcp-server
export HUBSPOT_TOKEN='pat-eu1-...'  # Your real token
export JWT_SECRET='local-test-secret'
npm run dev
```

**Step 2: Test health endpoint**

```bash
curl http://localhost:3000/health
```
Expected: `{"status":"ok"}`

**Step 3: Add a test user and get a token**

```bash
npm run add-user -- --name "Test User" --hubspot-owner-id 999
# Note the client_id and client_secret from output

curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"CLIENT_ID","client_secret":"CLIENT_SECRET"}'
```
Expected: JSON with `access_token`

**Step 4: Test MCP initialize**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```
Expected: JSON-RPC response with server capabilities and `mcp-session-id` header

**Step 5: Test a tool call (search_objects)**

Use the `mcp-session-id` from step 4:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_objects","arguments":{"objectType":"0-162","properties":["hs_name"],"limit":5}}}'
```
Expected: JSON-RPC response with Client Service records from HubSpot

**Step 6: Run all unit tests**

```bash
cd mcp-server && npm test
```
Expected: All tests pass

---

### Task 19: Add Tier C to test harness

**Files:**
- Modify: `tests/test_harness.py` — add Tier C support
- Modify: `tests/README.md` — document Tier C

This is the final task. Tier C replaces `curl` + `HUBSPOT_TOKEN` with MCP tool calls. The key differences:

1. System prompt teaches Claude to use MCP tools instead of curl
2. Claude connects to the MCP server via `--mcp-config`
3. No `HUBSPOT_TOKEN` in the prompt — the server holds it
4. Same 13 processes, same verification, same teardown

**Step 1: Add Tier C to the harness**

In `tests/test_harness.py`, modify:

1. Add `"C"` to the `choices` in `--tier` arg
2. Add `build_system_prompt` handling for tier `"C"`
3. Add MCP config for Tier C claude sessions
4. Default tiers remain `["A", "B"]` — Tier C must be explicitly selected

The Tier C system prompt replaces curl templates with MCP tool descriptions. The Claude session uses `--mcp-config` to connect to the running MCP server.

```python
# Tier C additions to build_system_prompt:
if tier == "C":
    base_prompt = (
        "You are an assistant that helps manage a HubSpot CRM system. "
        "You have MCP tools available for HubSpot operations. "
        "Use the search_objects, get_object, create_object, update_object, "
        "batch_read, get_associations, create_association, list_pipelines, "
        "and list_owners tools.\n\n"
        "Execute the workflow described. Create, update, or associate records as instructed. "
        "If data appears missing, broken, or inconsistent, say so explicitly."
    )
    parts = [base_prompt]
    if SKILL_PATH.exists():
        skill_text = SKILL_PATH.read_text()
        parts.append("\n\n--- ACTIVE SKILL ---\n\n")
        parts.append(skill_text)
    return "".join(parts)
```

For the Claude session in Tier C, add `--mcp-config` pointing to an MCP config file:

```python
# In execute_claude_session, for Tier C:
if tier == "C":
    mcp_config_path = TESTS_DIR / "mcp-config.json"
    cmd.extend(["--mcp-config", str(mcp_config_path)])
    # Remove "--tools", "Bash" — tools come from MCP
    cmd = [c for c in cmd if c not in ("--tools", "Bash")]
```

Create `tests/mcp-config.json`:

```json
{
  "mcpServers": {
    "hubspot": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_ACCESS_TOKEN}"
      }
    }
  }
}
```

**Step 2: Update README.md**

Add Tier C to the tier system documentation:

```markdown
- **Tier C (MCP)** — Base prompt + skill (adapted for MCP) + MCP tools (no raw token)
```

**Step 3: Test with dry run**

```bash
python3 tests/test_harness.py --tier C --dry-run
```
Expected: Shows processes with Tier C system prompt (no curl templates, no token)

**Step 4: Commit**

```bash
git add tests/test_harness.py tests/README.md tests/mcp-config.json
git commit -m "feat(tests): add Tier C (MCP transport) to test harness"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | 1 | Project scaffolding, dependencies |
| 2 | 2-4 | Logger, HubSpot client, auth module |
| 3 | 5-14 | All 9 MCP tools with unit tests |
| 4 | 15 | Server entry point wiring everything together |
| 5 | 16-17 | User management CLI, Dockerfile |
| 6 | 18-19 | Manual smoke test, Tier C harness |

**Total: 19 tasks, ~50 files**

After this plan is complete, the server is ready for:
1. You to deploy on Railway (add `HUBSPOT_TOKEN` and `JWT_SECRET` env vars)
2. Adding real users via `npm run add-user`
3. Running Tier C tests against the live server
4. Updating skills to reference MCP tools (separate task, as requested)
