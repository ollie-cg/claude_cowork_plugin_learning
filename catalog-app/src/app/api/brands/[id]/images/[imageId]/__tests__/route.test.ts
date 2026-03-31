import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { IMAGES_DIR } from "@/lib/paths";

// Mock the database and queries
vi.mock("@/lib/db", () => ({
  getPool: vi.fn(() => ({})),
  schemaReady: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/queries", () => ({
  getBrandImageById: vi.fn(),
  deleteBrandImage: vi.fn(),
}));

// Mock fs
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

describe("DELETE /api/brands/[id]/images/[imageId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete process.env.CATALOG_API_KEY;
  });

  it("deletes the image file and database record", async () => {
    const { getBrandImageById, deleteBrandImage } = await import("@/lib/queries");
    const mockImage = {
      id: 1,
      brand_id: 10,
      file_path: "brands/10/logo.png",
      image_type: "logo",
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
    };
    vi.mocked(getBrandImageById).mockResolvedValue(mockImage);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const { DELETE } = await import("../route");
    const req = new Request("http://localhost:4100/api/brands/10/images/1", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    const res = await DELETE(req as any, {
      params: Promise.resolve({ id: "10", imageId: "1" }),
    });

    expect(res.status).toBe(204);
    expect(getBrandImageById).toHaveBeenCalledWith({}, 1);
    expect(fs.existsSync).toHaveBeenCalledWith(
      path.join(IMAGES_DIR, "brands/10/logo.png")
    );
    expect(fs.unlinkSync).toHaveBeenCalledWith(
      path.join(IMAGES_DIR, "brands/10/logo.png")
    );
    expect(deleteBrandImage).toHaveBeenCalledWith({}, 1);
  });

  it("does not fail if the file does not exist", async () => {
    const { getBrandImageById, deleteBrandImage } = await import("@/lib/queries");
    const mockImage = {
      id: 1,
      brand_id: 10,
      file_path: "brands/10/missing.png",
      image_type: "logo",
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
    };
    vi.mocked(getBrandImageById).mockResolvedValue(mockImage);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const { DELETE } = await import("../route");
    const req = new Request("http://localhost:4100/api/brands/10/images/1", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    const res = await DELETE(req as any, {
      params: Promise.resolve({ id: "10", imageId: "1" }),
    });

    expect(res.status).toBe(204);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(deleteBrandImage).toHaveBeenCalledWith({}, 1);
  });

  it("returns 404 if image does not exist", async () => {
    const { getBrandImageById } = await import("@/lib/queries");
    vi.mocked(getBrandImageById).mockResolvedValue(null);

    const { DELETE } = await import("../route");
    const req = new Request("http://localhost:4100/api/brands/10/images/999", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    const res = await DELETE(req as any, {
      params: Promise.resolve({ id: "10", imageId: "999" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 if image belongs to a different brand", async () => {
    const { getBrandImageById } = await import("@/lib/queries");
    vi.mocked(getBrandImageById).mockResolvedValue({
      id: 1,
      brand_id: 99,
      file_path: "brands/99/logo.png",
      image_type: "logo",
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
    });

    const { DELETE } = await import("../route");
    const req = new Request("http://localhost:4100/api/brands/10/images/1", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    const res = await DELETE(req as any, {
      params: Promise.resolve({ id: "10", imageId: "1" }),
    });

    expect(res.status).toBe(404);
  });
});
