export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { getPool, schemaReady } from "@/lib/db";
import { getBrandById } from "@/lib/queries";
import { ProductTable } from "@/components/product-table";
import { Button } from "@/components/ui/button";

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await schemaReady();
  const pool = getPool();
  const brand = await getBrandById(pool, Number(id));

  if (!brand) notFound();

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        All Brands
      </Link>

      <div className="flex items-start justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20">
            <span className="text-xl font-bold text-violet-400">{brand.name.charAt(0)}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{brand.name}</h1>
            {brand.description && <p className="text-muted-foreground mt-0.5">{brand.description}</p>}
            <div className="flex gap-4 mt-1 text-xs text-muted-foreground/60">
              {brand.country && <span>{brand.country}</span>}
              {brand.website && (
                <a href={brand.website} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  {brand.website}
                </a>
              )}
            </div>
          </div>
        </div>
        <Link href={`/products/new?brand_id=${brand.id}`}>
          <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
            + Add Product
          </Button>
        </Link>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/50">
          <h2 className="text-sm font-medium text-muted-foreground">
            Products ({brand.products.length})
          </h2>
        </div>
        <ProductTable products={brand.products} />
      </div>
    </div>
  );
}
