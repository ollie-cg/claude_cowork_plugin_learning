import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { getAllBrands, createBrand } from "@/lib/queries";

export async function GET() {
  await schemaReady();
  const pool = getPool();
  const brands = await getAllBrands(pool);
  return NextResponse.json(brands);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  await schemaReady();
  const pool = getPool();
  const brand = await createBrand(pool, {
    name: body.name.trim(),
    description: body.description ?? null,
    logo_path: body.logo_path ?? null,
    website: body.website ?? null,
    country: body.country ?? null,
    hubspot_brand_id: body.hubspot_brand_id ?? null,
  });

  return NextResponse.json(brand, { status: 201 });
}
