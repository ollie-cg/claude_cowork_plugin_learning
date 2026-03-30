import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { deleteProductImage, getProductImageById } from "@/lib/queries";
import { IMAGES_DIR } from "@/lib/paths";
import fs from "fs";
import path from "path";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { imageId } = await params;
  await schemaReady();
  const pool = getPool();

  // Get image record to find file path
  const image = await getProductImageById(pool, Number(imageId));

  if (image) {
    const fullPath = path.join(IMAGES_DIR, image.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  await deleteProductImage(pool, Number(imageId));
  return new NextResponse(null, { status: 204 });
}
