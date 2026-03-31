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
