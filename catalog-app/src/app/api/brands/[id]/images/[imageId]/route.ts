import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { deleteBrandImage, getBrandImageById } from "@/lib/queries";
import { IMAGES_DIR } from "@/lib/paths";
import fs from "fs";
import path from "path";
import { withAuth } from "@/lib/auth";

export const DELETE = withAuth(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) => {
  const { imageId } = await params;
  await schemaReady();
  const pool = getPool();

  // Get image record to find file path
  const image = await getBrandImageById(pool, Number(imageId));

  if (image) {
    const fullPath = path.join(IMAGES_DIR, image.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  await deleteBrandImage(pool, Number(imageId));
  return new NextResponse(null, { status: 204 });
});
