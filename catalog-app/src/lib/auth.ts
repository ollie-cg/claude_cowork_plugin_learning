import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Authentication wrapper for API routes.
 * Validates Bearer token against CATALOG_API_KEY environment variable.
 * Returns 401 if authentication fails.
 */
export function withAuth<T extends Record<string, unknown>>(
  handler: (request: NextRequest, context: T) => Promise<NextResponse>
): (request: NextRequest, context: T) => Promise<NextResponse> {
  return async (request: NextRequest, context: T) => {
    const apiKey = process.env.CATALOG_API_KEY;

    // Reject all requests if API key is not configured
    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const authHeader = request.headers.get("Authorization");

    // Check if Authorization header is present
    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if it matches Bearer token format
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = parts[1];

    // Validate token against configured API key (timing-safe)
    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(apiKey);
    if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Token is valid, call the wrapped handler
    return handler(request, context);
  };
}
