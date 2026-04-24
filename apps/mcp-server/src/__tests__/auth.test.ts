import { describe, it, expect } from "vitest";
import { hashSync } from "bcryptjs";
import { issueToken, verifyToken, validateCredentials } from "../auth.js";
import type { UserConfig } from "../auth.js";

const TEST_SECRET = "test-jwt-secret-for-unit-tests";

const testUsers: UserConfig[] = [
  {
    client_id: "pb_danny_abc123",
    client_secret_hash: hashSync("secret_danny_xyz", 4),
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
