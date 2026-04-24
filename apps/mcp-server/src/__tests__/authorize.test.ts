import { describe, it, expect } from "vitest";
import http from "node:http";
import { createHash } from "node:crypto";
import { hashSync } from "bcryptjs";
import jwt from "jsonwebtoken";
import { createApp } from "../index.js";

const TEST_SECRET = "test-jwt-secret";
const CLIENT_ID = "pb_test_abc123";
const CLIENT_SECRET = "secret_test_xyz";
const OTHER_CLIENT_ID = "pb_other_def456";
const OTHER_CLIENT_SECRET = "secret_other_xyz";
const APP_CLIENT_ID = "cowork-pluginbrands";

const app = createApp({
  users: [
    {
      client_id: CLIENT_ID,
      client_secret_hash: hashSync(CLIENT_SECRET, 4),
      name: "Test User",
      hubspot_owner_id: "12345",
    },
    {
      client_id: OTHER_CLIENT_ID,
      client_secret_hash: hashSync(OTHER_CLIENT_SECRET, 4),
      name: "Other User",
      hubspot_owner_id: "67890",
    },
  ],
  hubspotToken: "fake-hubspot-token",
  jwtSecret: TEST_SECRET,
});

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function makeRequest(
  method: string,
  path: string,
  body?: string,
  contentType?: string
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      const options: http.RequestOptions = {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method,
        headers: {},
      };
      if (body && contentType) {
        options.headers!["Content-Type"] = contentType;
        options.headers!["Content-Length"] = Buffer.byteLength(body);
      }
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode!, headers: res.headers, body: data });
        });
      });
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      if (body) req.write(body);
      req.end();
    });
  });
}

describe("GET /authorize", () => {
  it("renders a generic login form (no user lookup)", async () => {
    const { status, body } = await makeRequest(
      "GET",
      `/authorize?response_type=code&client_id=${APP_CLIENT_ID}&redirect_uri=https://example.com/callback`
    );
    expect(status).toBe(200);
    expect(body).toContain("Sign in");
    // Both Client ID and Client Secret fields are visible (not hidden)
    expect(body).toContain('name="client_id"');
    expect(body).toContain('name="client_secret"');
    // App client_id is passed through via hidden field
    expect(body).toContain(`name="app_client_id" value="${APP_CLIENT_ID}"`);
    // No user name personalization — user is unknown at GET time
    expect(body).not.toContain("Test User");
  });

  it("accepts any URL client_id (OAuth app identity, not user)", async () => {
    const { status } = await makeRequest(
      "GET",
      "/authorize?response_type=code&client_id=whatever-cowork-uses&redirect_uri=https://example.com/callback"
    );
    expect(status).toBe(200);
  });

  it("returns 400 for missing response_type", async () => {
    const { status } = await makeRequest(
      "GET",
      `/authorize?client_id=${APP_CLIENT_ID}&redirect_uri=https://example.com/callback`
    );
    expect(status).toBe(400);
  });
});

describe("POST /authorize + token exchange", () => {
  it("redirects with code on valid credentials", async () => {
    const formBody = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: "https://example.com/callback",
      response_type: "code",
      state: "test-state-123",
    }).toString();

    const { status, headers } = await makeRequest(
      "POST",
      "/authorize",
      formBody,
      "application/x-www-form-urlencoded"
    );

    expect(status).toBe(302);
    const location = headers.location!;
    expect(location).toContain("https://example.com/callback");
    expect(location).toContain("code=");
    expect(location).toContain("state=test-state-123");
  });

  it("shows error page for wrong secret", async () => {
    const formBody = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: "wrong_secret",
      redirect_uri: "https://example.com/callback",
      response_type: "code",
    }).toString();

    const { status, body } = await makeRequest(
      "POST",
      "/authorize",
      formBody,
      "application/x-www-form-urlencoded"
    );

    expect(status).toBe(200);
    expect(body).toContain("Invalid Client ID or Secret");
  });

  it("full flow: authorize → token exchange with PKCE", async () => {
    // Generate PKCE pair
    const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    // Step 1: POST /authorize to get code
    const authBody = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: "https://example.com/callback",
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: "pkce-state",
    }).toString();

    const authRes = await makeRequest(
      "POST",
      "/authorize",
      authBody,
      "application/x-www-form-urlencoded"
    );

    expect(authRes.status).toBe(302);
    const redirectUrl = new URL(authRes.headers.location!);
    const code = redirectUrl.searchParams.get("code")!;
    expect(code).toBeTruthy();

    // Step 2: Exchange code for token
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: "https://example.com/callback",
      client_id: CLIENT_ID,
    }).toString();

    const tokenRes = await makeRequest(
      "POST",
      "/oauth/token",
      tokenBody,
      "application/x-www-form-urlencoded"
    );

    expect(tokenRes.status).toBe(200);
    const tokenData = JSON.parse(tokenRes.body);
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.token_type).toBe("bearer");
    expect(tokenData.expires_in).toBe(86400);
  });

  it("rejects code reuse", async () => {
    // Get a code
    const authBody = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: "https://example.com/callback",
      response_type: "code",
    }).toString();

    const authRes = await makeRequest(
      "POST",
      "/authorize",
      authBody,
      "application/x-www-form-urlencoded"
    );

    const redirectUrl = new URL(authRes.headers.location!);
    const code = redirectUrl.searchParams.get("code")!;

    // First use — should succeed
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
    }).toString();

    const first = await makeRequest("POST", "/oauth/token", tokenBody, "application/x-www-form-urlencoded");
    expect(first.status).toBe(200);

    // Second use — should fail
    const second = await makeRequest("POST", "/oauth/token", tokenBody, "application/x-www-form-urlencoded");
    expect(second.status).toBe(400);
    expect(JSON.parse(second.body).error).toBe("invalid_grant");
  });

  it("rejects wrong PKCE verifier", async () => {
    const codeVerifier = "correct-verifier-value-here-1234567890";
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const authBody = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: "https://example.com/callback",
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();

    const authRes = await makeRequest(
      "POST",
      "/authorize",
      authBody,
      "application/x-www-form-urlencoded"
    );

    const redirectUrl = new URL(authRes.headers.location!);
    const code = redirectUrl.searchParams.get("code")!;

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: "wrong-verifier-value",
      client_id: CLIENT_ID,
    }).toString();

    const tokenRes = await makeRequest(
      "POST",
      "/oauth/token",
      tokenBody,
      "application/x-www-form-urlencoded"
    );

    expect(tokenRes.status).toBe(400);
    expect(JSON.parse(tokenRes.body).error).toBe("invalid_grant");
    expect(JSON.parse(tokenRes.body).error_description).toContain("PKCE");
  });

  it("two users authenticating through the same app get distinct user identities", async () => {
    // Both users arrive via the same Cowork org-level app_client_id, but submit
    // their own personal credentials. Each should get a JWT attributed to them.
    async function tokenForUser(userClientId: string, userSecret: string): Promise<string> {
      const authBody = new URLSearchParams({
        app_client_id: APP_CLIENT_ID,
        client_id: userClientId,
        client_secret: userSecret,
        redirect_uri: "https://example.com/callback",
        response_type: "code",
      }).toString();

      const authRes = await makeRequest(
        "POST",
        "/authorize",
        authBody,
        "application/x-www-form-urlencoded"
      );
      const code = new URL(authRes.headers.location!).searchParams.get("code")!;

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: APP_CLIENT_ID,
      }).toString();
      const tokenRes = await makeRequest(
        "POST",
        "/oauth/token",
        tokenBody,
        "application/x-www-form-urlencoded"
      );
      return JSON.parse(tokenRes.body).access_token;
    }

    const jwtA = await tokenForUser(CLIENT_ID, CLIENT_SECRET);
    const jwtB = await tokenForUser(OTHER_CLIENT_ID, OTHER_CLIENT_SECRET);

    const payloadA = jwt.verify(jwtA, TEST_SECRET) as {
      client_id: string;
      name: string;
      hubspot_owner_id: string;
    };
    const payloadB = jwt.verify(jwtB, TEST_SECRET) as {
      client_id: string;
      name: string;
      hubspot_owner_id: string;
    };

    expect(payloadA.client_id).toBe(CLIENT_ID);
    expect(payloadA.name).toBe("Test User");
    expect(payloadA.hubspot_owner_id).toBe("12345");

    expect(payloadB.client_id).toBe(OTHER_CLIENT_ID);
    expect(payloadB.name).toBe("Other User");
    expect(payloadB.hubspot_owner_id).toBe("67890");
  });
});
