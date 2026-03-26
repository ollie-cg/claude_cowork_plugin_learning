import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createProduct } from "@/lib/queries";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.brand_id || !body.name?.trim()) {
    return NextResponse.json({ error: "brand_id and name are required" }, { status: 400 });
  }

  const db = getDb();
  const product = createProduct(db, { ...body, name: body.name.trim() });
  return NextResponse.json(product, { status: 201 });
}
