import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getProductById } from "@/lib/queries";
import { ProductForm } from "@/components/product-form";
import { ImageGallery } from "@/components/image-upload";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const product = getProductById(db, Number(id));

  if (!product) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href={`/brands/${product.brand_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        {product.brand_name}
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20">
          <span className="text-lg font-bold text-violet-400">{product.name.charAt(0)}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          {product.sku_code && <p className="text-sm text-muted-foreground font-mono">{product.sku_code}</p>}
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 mb-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">Images</h2>
        <ImageGallery productId={product.id} images={product.images} />
      </div>

      <ProductForm product={product} brandId={product.brand_id} />
    </div>
  );
}
