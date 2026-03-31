export const dynamic = "force-dynamic";

import { getPool, schemaReady } from "@/lib/db";
import { getAllBrands } from "@/lib/queries";
import { BrandCard } from "@/components/brand-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function HomePage() {
  await schemaReady();
  const pool = getPool();
  const brands = await getAllBrands(pool);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight gradient-text mb-2">Brands</h1>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground">
            {brands.length} {brands.length === 1 ? 'brand' : 'brands'} in catalog
          </p>
          <Link href="/brands/new">
            <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
              + Add Brand
            </Button>
          </Link>
        </div>
      </div>

      {brands.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <span className="text-2xl">+</span>
          </div>
          <p className="text-muted-foreground mb-4">No brands yet. Add one to get started.</p>
          <Link href="/brands/new">
            <Button variant="outline">Add your first brand</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      )}
    </div>
  );
}
