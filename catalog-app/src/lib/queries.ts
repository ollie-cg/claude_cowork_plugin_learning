import type { Pool } from "pg";
import type { Brand, BrandWithCount, BrandDetail, BrandInput, Product, ProductWithImages, ProductInput, ProductImage, BrandImage } from "@/types";

// Valid column names for products table (prevents SQL injection via dynamic keys)
const PRODUCT_COLUMNS = new Set<string>([
  "brand_id", "name", "sku_code", "ean", "case_ean", "description", "category",
  "category_detail", "uk_rsp", "wholesale_case_cost", "case_size", "vat_percent",
  "unit_depth_mm", "unit_width_mm", "unit_height_mm", "unit_net_weight_g",
  "unit_gross_weight_g", "case_depth_mm", "case_width_mm", "case_height_mm",
  "pallet_qty", "layer_qty", "energy_kj_per_100", "energy_kcal_per_100",
  "fat_per_100", "saturates_per_100", "carbs_per_100", "sugars_per_100",
  "fibre_per_100", "protein_per_100", "salt_per_100", "energy_kj_per_serving",
  "energy_kcal_per_serving", "fat_per_serving", "saturates_per_serving",
  "carbs_per_serving", "sugars_per_serving", "fibre_per_serving",
  "protein_per_serving", "salt_per_serving", "serving_type", "ingredients",
  "allergens", "country_of_origin", "manufacturer_name", "manufacturer_address",
  "shelf_life_days",
]);

// --- Brands ---

export async function getAllBrands(pool: Pool): Promise<BrandWithCount[]> {
  const result = await pool.query<BrandWithCount>(`
    SELECT b.*,
           COALESCE(cnt, 0)::int AS product_count,
           logo.file_path AS logo_url
    FROM brands b
    LEFT JOIN (SELECT brand_id, COUNT(*) AS cnt FROM products GROUP BY brand_id) p
      ON p.brand_id = b.id
    LEFT JOIN (SELECT DISTINCT ON (brand_id) brand_id, file_path
               FROM brand_images
               WHERE image_type = 'logo'
               ORDER BY brand_id, sort_order) logo
      ON logo.brand_id = b.id
    ORDER BY b.name
  `);
  return result.rows;
}

export async function getBrandById(pool: Pool, id: number): Promise<BrandDetail | null> {
  const brandResult = await pool.query<Brand>("SELECT * FROM brands WHERE id = $1", [id]);
  if (brandResult.rows.length === 0) return null;

  const brand = brandResult.rows[0];
  const [productsResult, imagesResult] = await Promise.all([
    pool.query<Product>("SELECT * FROM products WHERE brand_id = $1 ORDER BY name", [id]),
    pool.query<BrandImage>("SELECT * FROM brand_images WHERE brand_id = $1 ORDER BY sort_order", [id]),
  ]);

  return {
    ...brand,
    products: productsResult.rows,
    brand_images: imagesResult.rows
  };
}

export async function createBrand(pool: Pool, input: BrandInput): Promise<Brand> {
  const result = await pool.query<Brand>(`
    INSERT INTO brands (name, description, logo_path, website, country, hubspot_brand_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [input.name, input.description, input.logo_path, input.website, input.country, input.hubspot_brand_id]);

  return result.rows[0];
}

export async function updateBrand(pool: Pool, id: number, input: BrandInput): Promise<Brand | null> {
  const result = await pool.query<Brand>(`
    UPDATE brands
    SET name = $1, description = $2, logo_path = $3, website = $4, country = $5, hubspot_brand_id = $6, updated_at = NOW()
    WHERE id = $7
    RETURNING *
  `, [input.name, input.description, input.logo_path, input.website, input.country, input.hubspot_brand_id, id]);

  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function deleteBrand(pool: Pool, id: number): Promise<void> {
  await pool.query("DELETE FROM brands WHERE id = $1", [id]);
}

// --- Products ---

export async function getProductsByBrand(pool: Pool, brandId: number): Promise<Product[]> {
  const result = await pool.query<Product>("SELECT * FROM products WHERE brand_id = $1 ORDER BY name", [brandId]);
  return result.rows;
}

export async function getProductById(pool: Pool, id: number): Promise<ProductWithImages | null> {
  const productResult = await pool.query<Product & { brand_name: string }>(`
    SELECT p.*, b.name AS brand_name
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id = $1
  `, [id]);

  if (productResult.rows.length === 0) return null;

  const product = productResult.rows[0];
  const imagesResult = await pool.query<ProductImage>(
    "SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order",
    [id]
  );

  return { ...product, images: imagesResult.rows };
}

export async function createProduct(pool: Pool, input: Partial<ProductInput> & { brand_id: number; name: string }): Promise<Product> {
  const safeEntries = Object.entries(input).filter(([key]) => PRODUCT_COLUMNS.has(key));
  const columns = safeEntries.map(([key]) => key);
  const values = safeEntries.map(([, val]) => val);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const result = await pool.query<Product>(`
    INSERT INTO products (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `, values);

  return result.rows[0];
}

export async function updateProduct(pool: Pool, id: number, input: Partial<ProductInput> & { brand_id: number; name: string }): Promise<Product | null> {
  const safeEntries = Object.entries(input).filter(([key]) => PRODUCT_COLUMNS.has(key));
  const columns = safeEntries.map(([key]) => key);
  const values = safeEntries.map(([, val]) => val);
  const sets = columns.map((c, i) => `${c} = $${i + 1}`);
  sets.push(`updated_at = NOW()`);

  const result = await pool.query<Product>(
    `UPDATE products SET ${sets.join(", ")} WHERE id = $${values.length + 1} RETURNING *`,
    [...values, id]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function deleteProduct(pool: Pool, id: number): Promise<void> {
  await pool.query("DELETE FROM products WHERE id = $1", [id]);
}

// --- Product Images ---

export async function createProductImage(
  pool: Pool,
  input: { product_id: number; file_path: string; image_type: string | null; sort_order: number | null }
): Promise<ProductImage> {
  const result = await pool.query<ProductImage>(`
    INSERT INTO product_images (product_id, file_path, image_type, sort_order)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [input.product_id, input.file_path, input.image_type, input.sort_order]);

  return result.rows[0];
}

export async function getImagesByProduct(pool: Pool, productId: number): Promise<ProductImage[]> {
  const result = await pool.query<ProductImage>(
    "SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order",
    [productId]
  );
  return result.rows;
}

export async function getProductImageById(pool: Pool, id: number): Promise<ProductImage | null> {
  const result = await pool.query<ProductImage>(
    "SELECT * FROM product_images WHERE id = $1",
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function deleteProductImage(pool: Pool, id: number): Promise<void> {
  await pool.query("DELETE FROM product_images WHERE id = $1", [id]);
}

export async function getProductsByIds(pool: Pool, ids: number[]): Promise<ProductWithImages[]> {
  if (ids.length === 0) return [];

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const productsResult = await pool.query<Product & { brand_name: string }>(`
    SELECT p.*, b.name AS brand_name
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id IN (${placeholders})
  `, ids);

  const allImagesResult = await pool.query<ProductImage>(`
    SELECT * FROM product_images
    WHERE product_id IN (${placeholders})
    ORDER BY sort_order
  `, ids);

  const imagesByProduct = new Map<number, ProductImage[]>();
  for (const img of allImagesResult.rows) {
    const list = imagesByProduct.get(img.product_id) || [];
    list.push(img);
    imagesByProduct.set(img.product_id, list);
  }

  const productMap = new Map(productsResult.rows.map(p => [p.id, p]));
  return ids
    .map(id => productMap.get(id))
    .filter((p): p is (Product & { brand_name: string }) => p !== undefined)
    .map(p => ({ ...p, images: imagesByProduct.get(p.id) || [] }));
}

// --- Brand Images ---

export async function createBrandImage(
  pool: Pool,
  input: { brand_id: number; file_path: string; image_type: string | null; sort_order: number | null }
): Promise<BrandImage> {
  const result = await pool.query<BrandImage>(`
    INSERT INTO brand_images (brand_id, file_path, image_type, sort_order)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [input.brand_id, input.file_path, input.image_type, input.sort_order]);

  return result.rows[0];
}

export async function getImagesByBrand(pool: Pool, brandId: number): Promise<BrandImage[]> {
  const result = await pool.query<BrandImage>(
    "SELECT * FROM brand_images WHERE brand_id = $1 ORDER BY sort_order",
    [brandId]
  );
  return result.rows;
}

export async function getBrandImageById(pool: Pool, id: number): Promise<BrandImage | null> {
  const result = await pool.query<BrandImage>(
    "SELECT * FROM brand_images WHERE id = $1",
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function deleteBrandImage(pool: Pool, id: number): Promise<void> {
  await pool.query("DELETE FROM brand_images WHERE id = $1", [id]);
}
