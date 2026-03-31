import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../auth";

describe("withAuth", () => {
  const originalEnv = process.env.CATALOG_API_KEY;

  afterEach(() => {
    // Restore original env value
    if (originalEnv !== undefined) {
      process.env.CATALOG_API_KEY = originalEnv;
    } else {
      delete process.env.CATALOG_API_KEY;
    }
  });

  it("returns 401 when no Authorization header", async () => {
    process.env.CATALOG_API_KEY = "test-key-123";

    const mockHandler = async () => {
      return NextResponse.json({ success: true });
    };

    const wrappedHandler = withAuth(mockHandler);

    const request = new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
    });

    const response = await wrappedHandler(request, {});
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when Authorization header has wrong format (no Bearer)", async () => {
    process.env.CATALOG_API_KEY = "test-key-123";

    const mockHandler = async () => {
      return NextResponse.json({ success: true });
    };

    const wrappedHandler = withAuth(mockHandler);

    const request = new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: {
        Authorization: "test-key-123",
      },
    });

    const response = await wrappedHandler(request, {});
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when Authorization header has wrong format (multiple parts)", async () => {
    process.env.CATALOG_API_KEY = "test-key-123";

    const mockHandler = async () => {
      return NextResponse.json({ success: true });
    };

    const wrappedHandler = withAuth(mockHandler);

    const request = new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: {
        Authorization: "Bearer test key 123",
      },
    });

    const response = await wrappedHandler(request, {});
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when token is incorrect", async () => {
    process.env.CATALOG_API_KEY = "test-key-123";

    const mockHandler = async () => {
      return NextResponse.json({ success: true });
    };

    const wrappedHandler = withAuth(mockHandler);

    const request = new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: {
        Authorization: "Bearer wrong-key",
      },
    });

    const response = await wrappedHandler(request, {});
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("calls handler when token is correct", async () => {
    process.env.CATALOG_API_KEY = "test-key-123";

    const mockHandler = async () => {
      return NextResponse.json({ success: true });
    };

    const wrappedHandler = withAuth(mockHandler);

    const request = new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-key-123",
      },
    });

    const response = await wrappedHandler(request, {});
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ success: true });
  });

  it("returns 401 when CATALOG_API_KEY is not set", async () => {
    delete process.env.CATALOG_API_KEY;

    const mockHandler = async () => {
      return NextResponse.json({ success: true });
    };

    const wrappedHandler = withAuth(mockHandler);

    const request = new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: {
        Authorization: "Bearer some-key",
      },
    });

    const response = await wrappedHandler(request, {});
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("passes request and context to handler", async () => {
    process.env.CATALOG_API_KEY = "test-key-123";

    let receivedRequest: NextRequest | null = null;
    let receivedContext: any = null;

    const mockHandler = async (request: NextRequest, context: any) => {
      receivedRequest = request;
      receivedContext = context;
      return NextResponse.json({ success: true });
    };

    const wrappedHandler = withAuth(mockHandler);

    const request = new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-key-123",
      },
    });

    const context = { params: Promise.resolve({ id: "123" }) };

    await wrappedHandler(request, context);

    expect(receivedRequest).toBe(request);
    expect(receivedContext).toBe(context);
  });
});
