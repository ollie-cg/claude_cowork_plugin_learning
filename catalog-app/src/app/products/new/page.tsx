import { redirect } from "next/navigation";
import Link from "next/link";
import { getPool, schemaReady } from "@/lib/db";
import { getBrandById } from "@/lib/queries";
import { ProductForm } from "@/components/product-form";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ brand_id?: string }> }) {
  const { brand_id } = await searchParams;

  if (!brand_id) redirect("/");

  await schemaReady();
  const pool = getPool();
  const brand = await getBrandById(pool, Number(brand_id));

  if (!brand) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href={`/brands/${brand.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        {brand.name}
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-6">Add Product to {brand.name}</h1>

      <ProductForm brandId={brand.id} />
    </div>
  );
}
