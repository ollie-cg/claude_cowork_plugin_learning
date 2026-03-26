// src/app/api/decks/gamma/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBrandById, getProductsByIds } from "@/lib/queries";
import { buildGammaInputText } from "@/lib/gamma-input";
import { createGammaDeck, pollGammaGeneration } from "@/lib/gamma-client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { brand_id, product_ids, prospect_name, message } = body;

  if (!brand_id) {
    return NextResponse.json(
      { error: "brand_id is required" },
      { status: 400 }
    );
  }
  if (!prospect_name?.trim()) {
    return NextResponse.json(
      { error: "prospect_name is required" },
      { status: 400 }
    );
  }
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return NextResponse.json(
      { error: "product_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  const tunnelUrl = process.env.TUNNEL_URL;
  if (!tunnelUrl) {
    return NextResponse.json(
      { error: "TUNNEL_URL is not configured — start ngrok first" },
      { status: 400 }
    );
  }

  const db = getDb();
  const brandDetail = getBrandById(db, Number(brand_id));
  if (!brandDetail) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const products = getProductsByIds(db, product_ids.map(Number));
  if (products.length === 0) {
    return NextResponse.json(
      { error: "No products found for given IDs" },
      { status: 404 }
    );
  }

  const inputText = buildGammaInputText({
    brand: brandDetail,
    products,
    prospectName: prospect_name.trim(),
    message: message?.trim() || undefined,
    tunnelUrl,
  });

  const numCards = 7 + Math.min(products.length, 3);

  try {
    const { generationId } = await createGammaDeck({
      inputText,
      numCards: Math.min(numCards, 60),
    });

    const result = await pollGammaGeneration(generationId);

    return NextResponse.json({
      gammaUrl: result.gammaUrl,
      gammaId: result.gammaId,
      exportUrl: result.exportUrl || null,
      generationId,
    });
  } catch (err) {
    const errMessage =
      err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Gamma generation failed: ${errMessage}` },
      { status: 502 }
    );
  }
}
