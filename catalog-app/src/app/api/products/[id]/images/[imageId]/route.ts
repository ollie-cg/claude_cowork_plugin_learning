import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteProductImage } from "@/lib/queries";
import { IMAGES_DIR } from "@/lib/paths";
import fs from "fs";
import path from "path";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { imageId } = await params;
  const db = getDb();

  // Get image record to find file path
  const image = db.prepare("SELECT file_path FROM product_images WHERE id = ?").get(Number(imageId)) as { file_path: string } | undefined;

  if (image) {
    const fullPath = path.join(IMAGES_DIR, image.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  deleteProductImage(db, Number(imageId));
  return new NextResponse(null, { status: 204 });
}
