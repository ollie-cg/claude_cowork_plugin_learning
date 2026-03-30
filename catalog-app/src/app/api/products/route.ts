import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { createProduct } from "@/lib/queries";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.brand_id || !body.name?.trim()) {
    return NextResponse.json({ error: "brand_id and name are required" }, { status: 400 });
  }

  await schemaReady();
  const pool = getPool();
  const product = await createProduct(pool, { ...body, name: body.name.trim() });
  return NextResponse.json(product, { status: 201 });
}
