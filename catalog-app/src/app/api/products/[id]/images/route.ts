import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { createProductImage, getImagesByProduct, getProductById } from "@/lib/queries";
import { IMAGES_DIR } from "@/lib/paths";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { withAuth } from "@/lib/auth";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const VALID_IMAGE_TYPES = new Set(["hero", "pack", "lifestyle", "nutritional"]);

export const GET = withAuth(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await schemaReady();
  const pool = getPool();
  const images = await getImagesByProduct(pool, Number(id));
  return NextResponse.json(images);
});

export const POST = withAuth(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  await schemaReady();
  const pool = getPool();

  const product = await getProductById(pool, productId);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const imageType = (formData.get("image_type") as string) || null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, { status: 413 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: `Invalid file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}` }, { status: 400 });
  }

  if (imageType && !VALID_IMAGE_TYPES.has(imageType)) {
    return NextResponse.json({ error: `Invalid image_type. Allowed: ${[...VALID_IMAGE_TYPES].join(", ")}` }, { status: 400 });
  }

  // Save file: data/images/<brandId>/<productId>/<unique_filename>
  const subDir = path.join(String(product.brand_id), String(productId));
  const dirPath = path.join(IMAGES_DIR, subDir);
  fs.mkdirSync(dirPath, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueName = `${randomBytes(4).toString("hex")}_${safeName}`;
  const filePath = path.join(subDir, uniqueName);
  const fullPath = path.join(IMAGES_DIR, filePath);

  // Verify resolved path stays within IMAGES_DIR
  if (!path.resolve(fullPath).startsWith(path.resolve(IMAGES_DIR))) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    fs.writeFileSync(fullPath, buffer);
    const image = await createProductImage(pool, {
      product_id: productId,
      file_path: filePath,
      image_type: imageType,
      sort_order: sortOrder,
    });
    return NextResponse.json(image, { status: 201 });
  } catch (err) {
    // Clean up file if DB insert failed
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch {}
    }
    throw err;
  }
});
