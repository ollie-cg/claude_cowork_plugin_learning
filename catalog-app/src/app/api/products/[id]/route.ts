import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { getProductById, updateProduct, deleteProduct } from "@/lib/queries";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await schemaReady();
  const pool = getPool();
  const product = await getProductById(pool, Number(id));

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Build absolute image URLs
  const baseUrl = process.env.CATALOG_APP_URL || "http://localhost:4100";
  const withUrls = {
    ...product,
    images: product.images.map((img) => ({
      ...img,
      url: `${baseUrl}/api/images/${img.file_path}`,
    })),
  };

  return NextResponse.json(withUrls);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  if (!body.brand_id || !body.name?.trim()) {
    return NextResponse.json({ error: "brand_id and name are required" }, { status: 400 });
  }

  await schemaReady();
  const pool = getPool();
  const product = await updateProduct(pool, Number(id), { ...body, name: body.name.trim() });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await schemaReady();
  const pool = getPool();
  await deleteProduct(pool, Number(id));
  return new NextResponse(null, { status: 204 });
}
