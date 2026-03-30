import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { createProductImage, getImagesByProduct, getProductById } from "@/lib/queries";
import { IMAGES_DIR } from "@/lib/paths";
import fs from "fs";
import path from "path";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await schemaReady();
  const pool = getPool();
  const images = await getImagesByProduct(pool, Number(id));
  return NextResponse.json(images);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
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

  // Save file: data/images/<brandId>/<productId>/<filename>
  const subDir = path.join(String(product.brand_id), String(productId));
  const dirPath = path.join(IMAGES_DIR, subDir);
  fs.mkdirSync(dirPath, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(subDir, safeName);
  const fullPath = path.join(IMAGES_DIR, filePath);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);

  const image = await createProductImage(pool, {
    product_id: productId,
    file_path: filePath,
    image_type: imageType,
    sort_order: sortOrder,
  });

  return NextResponse.json(image, { status: 201 });
}
