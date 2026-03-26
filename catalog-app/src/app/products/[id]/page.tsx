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
    <div className="container mx-auto py-8 px-4">
      <div className="mb-2">
        <Link href={`/brands/${product.brand_id}`} className="text-sm text-muted-foreground hover:underline">
          ← {product.brand_name}
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">{product.name}</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Images</h2>
        <ImageGallery productId={product.id} images={product.images} />
      </div>

      <ProductForm product={product} brandId={product.brand_id} />
    </div>
  );
}
