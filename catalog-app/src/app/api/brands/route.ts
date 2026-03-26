import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAllBrands, createBrand } from "@/lib/queries";

export async function GET() {
  const db = getDb();
  const brands = getAllBrands(db);
  return NextResponse.json(brands);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const brand = createBrand(db, {
    name: body.name.trim(),
    description: body.description ?? null,
    logo_path: body.logo_path ?? null,
    website: body.website ?? null,
    country: body.country ?? null,
  });

  return NextResponse.json(brand, { status: 201 });
}
