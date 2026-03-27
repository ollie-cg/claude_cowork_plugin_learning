import Database from "better-sqlite3";
import type { Brand, BrandWithCount, BrandDetail, BrandInput, Product, ProductWithImages, ProductInput, ProductImage } from "@/types";

// --- Brands ---

export function getAllBrands(db: Database.Database): BrandWithCount[] {
  return db.prepare(`
    SELECT b.*, COALESCE(cnt, 0) AS product_count
    FROM brands b
    LEFT JOIN (SELECT brand_id, COUNT(*) AS cnt FROM products GROUP BY brand_id) p
      ON p.brand_id = b.id
    ORDER BY b.name
  `).all() as BrandWithCount[];
}

export function getBrandById(db: Database.Database, id: number): BrandDetail | null {
  const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(id) as Brand | undefined;
  if (!brand) return null;

  const products = db.prepare("SELECT * FROM products WHERE brand_id = ? ORDER BY name").all(id) as Product[];
  return { ...brand, products };
}

export function createBrand(db: Database.Database, input: BrandInput): Brand {
  const result = db.prepare(`
    INSERT INTO brands (name, description, logo_path, website, country)
    VALUES (@name, @description, @logo_path, @website, @country)
  `).run(input);

  return db.prepare("SELECT * FROM brands WHERE id = ?").get(result.lastInsertRowid) as Brand;
}

export function updateBrand(db: Database.Database, id: number, input: BrandInput): Brand | null {
  db.prepare(`
    UPDATE brands SET name = @name, description = @description, logo_path = @logo_path,
      website = @website, country = @country, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });

  return db.prepare("SELECT * FROM brands WHERE id = ?").get(id) as Brand | undefined ?? null;
}

export function deleteBrand(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM brands WHERE id = ?").run(id);
}

// --- Products ---

export function getProductsByBrand(db: Database.Database, brandId: number): Product[] {
  return db.prepare("SELECT * FROM products WHERE brand_id = ? ORDER BY name").all(brandId) as Product[];
}

export function getProductById(db: Database.Database, id: number): ProductWithImages | null {
  const product = db.prepare(`
    SELECT p.*, b.name AS brand_name
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id = ?
  `).get(id) as (Product & { brand_name: string }) | undefined;

  if (!product) return null;

  const images = db.prepare(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order"
  ).all(id) as ProductImage[];

  return { ...product, images };
}

export function createProduct(db: Database.Database, input: Partial<ProductInput> & { brand_id: number; name: string }): Product {
  const columns = Object.keys(input);
  const placeholders = columns.map((c) => `@${c}`);

  const result = db.prepare(`
    INSERT INTO products (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
  `).run(input);

  return db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid) as Product;
}

export function updateProduct(db: Database.Database, id: number, input: Partial<ProductInput> & { brand_id: number; name: string }): Product | null {
  const sets = Object.keys(input).map((c) => `${c} = @${c}`);
  sets.push("updated_at = datetime('now')");

  db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = @id`).run({ ...input, id });

  return db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined ?? null;
}

export function deleteProduct(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

// --- Product Images ---

export function createProductImage(
  db: Database.Database,
  input: { product_id: number; file_path: string; image_type: string | null; sort_order: number | null }
): ProductImage {
  const result = db.prepare(`
    INSERT INTO product_images (product_id, file_path, image_type, sort_order)
    VALUES (@product_id, @file_path, @image_type, @sort_order)
  `).run(input);

  return db.prepare("SELECT * FROM product_images WHERE id = ?").get(result.lastInsertRowid) as ProductImage;
}

export function getImagesByProduct(db: Database.Database, productId: number): ProductImage[] {
  return db.prepare(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order"
  ).all(productId) as ProductImage[];
}

export function deleteProductImage(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM product_images WHERE id = ?").run(id);
}

export function getProductsByIds(db: Database.Database, ids: number[]): ProductWithImages[] {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const products = db.prepare(`
    SELECT p.*, b.name AS brand_name
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id IN (${placeholders})
  `).all(...ids) as (Product & { brand_name: string })[];

  const allImages = db.prepare(`
    SELECT * FROM product_images
    WHERE product_id IN (${placeholders})
    ORDER BY sort_order
  `).all(...ids) as ProductImage[];

  const imagesByProduct = new Map<number, ProductImage[]>();
  for (const img of allImages) {
    const list = imagesByProduct.get(img.product_id) || [];
    list.push(img);
    imagesByProduct.set(img.product_id, list);
  }

  const productMap = new Map(products.map(p => [p.id, p]));
  return ids
    .map(id => productMap.get(id))
    .filter((p): p is (Product & { brand_name: string }) => p !== undefined)
    .map(p => ({ ...p, images: imagesByProduct.get(p.id) || [] }));
}
