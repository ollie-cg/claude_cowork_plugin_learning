import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getBrandById } from "@/lib/queries";
import { ProductForm } from "@/components/product-form";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ brand_id?: string }> }) {
  const { brand_id } = await searchParams;

  if (!brand_id) redirect("/");

  const db = getDb();
  const brand = getBrandById(db, Number(brand_id));

  if (!brand) redirect("/");

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-2">
        <Link href={`/brands/${brand.id}`} className="text-sm text-muted-foreground hover:underline">
          ← {brand.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Add Product to {brand.name}</h1>

      <ProductForm brandId={brand.id} />
    </div>
  );
}
