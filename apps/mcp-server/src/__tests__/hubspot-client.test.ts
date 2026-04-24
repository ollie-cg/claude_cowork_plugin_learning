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
