import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGammaDeck, pollGammaGeneration } from "@/lib/gamma-client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv("GAMMA_API_KEY", "sk-test-key");
});

describe("createGammaDeck", () => {
  it("sends correct request to Gamma API and returns generationId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ generationId: "gen-123" }),
    });

    const result = await createGammaDeck({
      inputText: "# Test Deck\nSlide content",
      numCards: 5,
    });

    expect(result).toEqual({ generationId: "gen-123" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://public-api.gamma.app/v1.0/generations",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": "sk-test-key",
        },
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.inputText).toBe("# Test Deck\nSlide content");
    expect(body.format).toBe("presentation");
    expect(body.textMode).toBe("preserve");
  });

  it("throws if API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid API key" }),
    });

    await expect(createGammaDeck({ inputText: "test" })).rejects.toThrow(
      "Gamma API error (401)"
    );
  });
});

describe("pollGammaGeneration", () => {
  it("returns completed result immediately if status is completed", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        generationId: "gen-123",
        status: "completed",
        gammaUrl: "https://gamma.app/docs/test-abc123",
        exportUrl: null,
      }),
    });

    const result = await pollGammaGeneration("gen-123", {
      intervalMs: 0,
      maxAttempts: 1,
    });

    expect(result.status).toBe("completed");
    expect(result.gammaUrl).toBe("https://gamma.app/docs/test-abc123");
  });

  it("throws on failed status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        generationId: "gen-123",
        status: "failed",
        error: { message: "Generation failed" },
      }),
    });

    await expect(
      pollGammaGeneration("gen-123", { intervalMs: 0, maxAttempts: 1 })
    ).rejects.toThrow("Gamma generation failed");
  });
});
