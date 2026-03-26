import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getBrandById } from "@/lib/queries";
import { ProductTable } from "@/components/product-table";
import { Button } from "@/components/ui/button";

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const brand = getBrandById(db, Number(id));

  if (!brand) notFound();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-2">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← All Brands
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{brand.name}</h1>
          {brand.description && <p className="text-muted-foreground mt-1">{brand.description}</p>}
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            {brand.country && <span>{brand.country}</span>}
            {brand.website && (
              <a href={brand.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {brand.website}
              </a>
            )}
          </div>
        </div>
        <Link href={`/products/new?brand_id=${brand.id}`}>
          <Button>Add Product</Button>
        </Link>
      </div>

      <ProductTable products={brand.products} />
    </div>
  );
}
