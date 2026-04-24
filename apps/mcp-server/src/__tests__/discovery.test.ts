import { describe, it, expect } from "vitest";
import http from "node:http";
import { createApp } from "../index.js";

const app = createApp({
  users: [],
  hubspotToken: "fake-token",
  jwtSecret: "fake-secret",
});

function request(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      http.get(`http://127.0.0.1:${addr.port}${path}`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        });
      }).on("error", (err) => {
        server.close();
        reject(err);
      });
    });
  });
}

describe("OAuth discovery endpoints", () => {
  it("serves protected resource metadata", async () => {
    const { status, body } = await request("/.well-known/oauth-protected-resource");
    expect(status).toBe(200);
    expect(body.resource).toContain("/mcp");
    expect(body.authorization_servers).toBeInstanceOf(Array);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });

  it("serves authorization server metadata", async () => {
    const { status, body } = await request("/.well-known/oauth-authorization-server");
    expect(status).toBe(200);
    expect(body.token_endpoint).toContain("/oauth/token");
    expect(body.grant_types_supported).toEqual(["authorization_code", "client_credentials"]);
    expect(body.issuer).toBeDefined();
  });
});
