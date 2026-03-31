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
    existsSync: vi.fn(() => false),
    unlinkSync: vi.fn(),
  },
}));

// Mock crypto.randomBytes for deterministic filenames
vi.mock("crypto", () => ({
  randomBytes: vi.fn(() => Buffer.from("aabbccdd", "hex")),
  timingSafeEqual: vi.fn((a: Buffer, b: Buffer) => a.equals(b)),
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
      { id: 1, brand_id: 10, file_path: "brands/10/logo.png", image_type: "logo", sort_order: 0, created_at: "2024-01-01T00:00:00Z" },
      { id: 2, brand_id: 10, file_path: "brands/10/hero.jpg", image_type: "hero", sort_order: 1, created_at: "2024-01-02T00:00:00Z" },
    ];
    vi.mocked(getImagesByBrand).mockResolvedValue(mockImages);

    const { GET } = await import("../route");
    const req = new Request("http://localhost:4100/api/brands/10/images", {
      headers: { Authorization: "Bearer test-api-key" },
    });
    const res = await GET(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(mockImages);
    expect(getImagesByBrand).toHaveBeenCalledWith({}, 10);
  });
});

describe("POST /api/brands/[id]/images", () => {
  const mockBrand = {
    id: 10, name: "Test Brand", description: null, logo_path: null,
    website: null, country: null, hubspot_brand_id: null,
    created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
    products: [], brand_images: [],
  };

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
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "999" }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toEqual({ error: "Brand not found" });
  });

  it("returns 400 if file is missing", async () => {
    const { getBrandById } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue(mockBrand);

    const { POST } = await import("../route");
    const formData = new FormData();

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: "file is required" });
  });

  it("returns 400 for invalid brand ID", async () => {
    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test"], "test.png", { type: "image/png" }));

    const req = new Request("http://localhost:4100/api/brands/abc/images", {
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "abc" }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: "Invalid brand ID" });
  });

  it("returns 413 for files exceeding size limit", async () => {
    const { getBrandById } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue(mockBrand);

    const { POST } = await import("../route");
    const formData = new FormData();
    const largeContent = new Uint8Array(11 * 1024 * 1024); // 11 MB
    formData.append("file", new File([largeContent], "big.png", { type: "image/png" }));

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(413);
  });

  it("returns 400 for invalid file type", async () => {
    const { getBrandById } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue(mockBrand);

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test"], "script.exe", { type: "application/octet-stream" }));

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid file type/);
  });

  it("returns 400 for invalid image_type", async () => {
    const { getBrandById } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue(mockBrand);

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test"], "test.png", { type: "image/png" }));
    formData.append("image_type", "banner");

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid image_type/);
  });

  it("uploads an image with unique filename prefix", async () => {
    const { getBrandById, createBrandImage } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue(mockBrand);
    vi.mocked(createBrandImage).mockResolvedValue({
      id: 1, brand_id: 10, file_path: "brands/10/aabbccdd_logo.png",
      image_type: "logo", sort_order: 0, created_at: "2024-01-01T00:00:00Z",
    });

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test content"], "logo.png", { type: "image/png" }));
    formData.append("image_type", "logo");

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(res.status).toBe(201);
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(IMAGES_DIR, "brands", "10"), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(createBrandImage).toHaveBeenCalledWith({}, expect.objectContaining({
      brand_id: 10,
      file_path: expect.stringMatching(/^brands\/10\/[0-9a-f]+_logo\.png$/),
      image_type: "logo",
    }));
  });

  it("sanitizes filename by replacing invalid characters", async () => {
    const { getBrandById, createBrandImage } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue(mockBrand);
    vi.mocked(createBrandImage).mockResolvedValue({
      id: 1, brand_id: 10, file_path: "brands/10/aabbccdd_my_brand_logo.png",
      image_type: "logo", sort_order: 0, created_at: "2024-01-01T00:00:00Z",
    });

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test"], "my brand logo.png", { type: "image/png" }));

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(createBrandImage).toHaveBeenCalledWith({}, expect.objectContaining({
      file_path: expect.stringMatching(/^brands\/10\/[0-9a-f]+_my_brand_logo\.png$/),
    }));
  });

  it("uses default sort_order of 0 when not provided", async () => {
    const { getBrandById, createBrandImage } = await import("@/lib/queries");
    vi.mocked(getBrandById).mockResolvedValue(mockBrand);
    vi.mocked(createBrandImage).mockResolvedValue({
      id: 1, brand_id: 10, file_path: "brands/10/aabbccdd_hero.jpg",
      image_type: "hero", sort_order: 0, created_at: "2024-01-01T00:00:00Z",
    });

    const { POST } = await import("../route");
    const formData = new FormData();
    formData.append("file", new File(["test"], "hero.jpg", { type: "image/jpeg" }));
    formData.append("image_type", "hero");

    const req = new Request("http://localhost:4100/api/brands/10/images", {
      method: "POST", body: formData,
      headers: { Authorization: "Bearer test-api-key" },
    });
    await POST(req as any, { params: Promise.resolve({ id: "10" }) });

    expect(createBrandImage).toHaveBeenCalledWith({}, expect.objectContaining({
      sort_order: 0,
    }));
  });
});
