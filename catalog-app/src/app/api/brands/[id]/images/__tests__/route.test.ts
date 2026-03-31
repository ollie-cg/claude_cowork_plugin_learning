import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { IMAGES_DIR } from "@/lib/paths";

// Mock the database and queries
vi.mock("@/lib/db", () => ({
  getPool: vi.fn(() => ({})),
  schemaReady: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/queries", () => ({
  getBrandById: vi.fn(),
  getImagesByBrand: vi.fn(),
  createBrandImage: vi.fn(),
}));

// Mock fs
vi.mock("fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

describe("GET /api/brands/[id]/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete process.env.CATALOG_API_KEY;
  });

  it("returns all images for a brand", async () => {
    const { getImagesByBrand } = await import("@/lib/queries");
    const mockImages = [
      {
        id: 1,
        brand_id: 10,
        file_path: "brands/10/logo.png",
        image_type: "logo",
        sort_order: 0,
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: 2,
        brand_id: 10,
        file_path: "brands/10/hero.jpg",
        image_type: "hero",
        sort_order: 1,
        created_at: "2024-01-02T00:00:00Z",
      },
    ];
    vi.mocked(getImagesByBrand).mockResolvedValue(mockImages);

    const { GET } = await import("../route");
    const req = new Request("http://localhost:4100/api/brands/10/images", {
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    const res = await GET(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(mockImages);
    expect(getImagesByBrand).toHaveBeenCalledWith({}, 10);
  });
});

describe("POST /api/brands/[id]/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete process.env.CATALOG_API_KEY;
  });

  it("returns 404 if brand does not exist", async () => {
    const { getBrandById } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue(null);

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test"], "test.png", { type: "image/png" }));

    const req = new Request("http://localhost:4100/api/brands/999/images", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "999" }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toEqual({ error: "Brand not found" });
  });

  it("returns 400 if file is missing", async () => {
    const { getBrandById } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue({
      id: 10,
      name: "Test Brand",
      description: null,
      logo_path: null,
      website: null,
      country: null,
      hubspot_brand_id: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      products: [],
      brand_images: [],
    });

    const { POST } = await import("../route");
    const formData = new FormData();

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: "file is required" });
  });

  it("uploads an image and creates a brand image record", async () => {
    const { getBrandById, createBrandImage } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue({
      id: 10,
      name: "Test Brand",
      description: null,
      logo_path: null,
      website: null,
      country: null,
      hubspot_brand_id: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      products: [],
      brand_images: [],
    });

    const mockCreatedImage = {
      id: 1,
      brand_id: 10,
      file_path: "brands/10/logo.png",
      image_type: "logo",
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
    };
    vi.mocked(createBrandImage).mockResolvedValue(mockCreatedImage);

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test content"], "logo.png", { type: "image/png" }));
    formData.append("image_type", "logo");
    formData.append("sort_order", "0");

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual(mockCreatedImage);

    // Verify file system operations
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      path.join(IMAGES_DIR, "brands", "10"),
      { recursive: true }
    );
    expect(fs.writeFileSync).toHaveBeenCalled();

    // Verify database call
    expect(createBrandImage).toHaveBeenCalledWith({}, {
      brand_id: 10,
      file_path: "brands/10/logo.png",
      image_type: "logo",
      sort_order: 0,
    });
  });

  it("sanitizes filename by replacing invalid characters", async () => {
    const { getBrandById, createBrandImage } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue({
      id: 10,
      name: "Test Brand",
      description: null,
      logo_path: null,
      website: null,
      country: null,
      hubspot_brand_id: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      products: [],
      brand_images: [],
    });

    const mockCreatedImage = {
      id: 1,
      brand_id: 10,
      file_path: "brands/10/my_brand_logo.png",
      image_type: "logo",
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
    };
    vi.mocked(createBrandImage).mockResolvedValue(mockCreatedImage);

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test"], "my brand logo.png", { type: "image/png" }));

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    // Verify filename was sanitized (spaces replaced with underscores)
    expect(createBrandImage).toHaveBeenCalledWith({}, expect.objectContaining({
      file_path: "brands/10/my_brand_logo.png",
    }));
  });

  it("uses default sort_order of 0 when not provided", async () => {
    const { getBrandById, createBrandImage } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue({
      id: 10,
      name: "Test Brand",
      description: null,
      logo_path: null,
      website: null,
      country: null,
      hubspot_brand_id: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      products: [],
      brand_images: [],
    });

    vi.mocked(createBrandImage).mockResolvedValue({
      id: 1,
      brand_id: 10,
      file_path: "brands/10/hero.jpg",
      image_type: "hero",
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
    });

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test"], "hero.jpg", { type: "image/jpeg" }));
    formData.append("image_type", "hero");

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(createBrandImage).toHaveBeenCalledWith({}, expect.objectContaining({
      sort_order: 0,
    }));
  });
});
