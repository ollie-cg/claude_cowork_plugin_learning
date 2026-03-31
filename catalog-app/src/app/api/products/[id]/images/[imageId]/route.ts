import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { deleteProductImage, getProductImageById } from "@/lib/queries";
import { IMAGES_DIR } from "@/lib/paths";
import fs from "fs";
import path from "path";
import { withAuth } from "@/lib/auth";

export const DELETE = withAuth(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) => {
  const { id, imageId } = await params;
  await schemaReady();
  const pool = getPool();

  const image = await getProductImageById(pool, Number(imageId));

  if (!image || image.product_id !== Number(id)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const fullPath = path.join(IMAGES_DIR, image.file_path);
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await deleteProductImage(pool, image.id);
  } catch (err) {
    throw err;
  }

  return new NextResponse(null, { status: 204 });
});
