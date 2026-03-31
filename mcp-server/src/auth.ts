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
