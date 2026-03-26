import { getDb } from "@/lib/db";
import { getAllBrands } from "@/lib/queries";
import { BrandCard } from "@/components/brand-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HomePage() {
  const db = getDb();
  const brands = getAllBrands(db);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Product Catalog</h1>
        <Link href="/brands/new">
          <Button>Add Brand</Button>
        </Link>
      </div>

      {brands.length === 0 ? (
        <p className="text-muted-foreground">No brands yet. Add one to get started.</p>
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
