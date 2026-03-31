import { NextRequest, NextResponse } from "next/server";
import { getPool, schemaReady } from "@/lib/db";
import { getBrandById, updateBrand, deleteBrand } from "@/lib/queries";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await schemaReady();
  const pool = getPool();
  const brand = await getBrandById(pool, Number(id));

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  return NextResponse.json(brand);
});

export const PUT = withAuth(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  await schemaReady();
  const pool = getPool();
  const brand = await updateBrand(pool, Number(id), {
    name: body.name.trim(),
    description: body.description ?? null,
    logo_path: body.logo_path ?? null,
    website: body.website ?? null,
    country: body.country ?? null,
    hubspot_brand_id: body.hubspot_brand_id ?? null,
  });

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  return NextResponse.json(brand);
});

export const DELETE = withAuth(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await schemaReady();
  const pool = getPool();
  await deleteBrand(pool, Number(id));
  return new NextResponse(null, { status: 204 });
});
