import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { createBrandImage, getImagesByBrand, getBrandById } from "@/lib/queries";
import { IMAGES_DIR } from "@/lib/paths";
import fs from "fs";
import path from "path";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await schemaReady();
  const pool = getPool();
  const images = await getImagesByBrand(pool, Number(id));
  return NextResponse.json(images);
});

export const POST = withAuth(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const brandId = Number(id);
  await schemaReady();
  const pool = getPool();

  const brand = await getBrandById(pool, brandId);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const imageType = (formData.get("image_type") as string) || null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Save file: data/images/brands/<brandId>/<filename>
  const subDir = path.join("brands", String(brandId));
  const dirPath = path.join(IMAGES_DIR, subDir);
  fs.mkdirSync(dirPath, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(subDir, safeName);
  const fullPath = path.join(IMAGES_DIR, filePath);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);

  const image = await createBrandImage(pool, {
    brand_id: brandId,
    file_path: filePath,
    image_type: imageType,
    sort_order: sortOrder,
  });

  return NextResponse.json(image, { status: 201 });
});
