import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBrandById, updateBrand, deleteBrand } from "@/lib/queries";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const brand = getBrandById(db, Number(id));

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  return NextResponse.json(brand);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const brand = updateBrand(db, Number(id), {
    name: body.name.trim(),
    description: body.description ?? null,
    logo_path: body.logo_path ?? null,
    website: body.website ?? null,
    country: body.country ?? null,
  });

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  return NextResponse.json(brand);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  deleteBrand(db, Number(id));
  return new NextResponse(null, { status: 204 });
}
