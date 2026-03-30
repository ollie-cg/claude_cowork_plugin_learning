import { Pool } from "pg";

let _pool: Pool | null = null;
let _schemaReady: Promise<void> | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const DATABASE_URL =
      process.env.DATABASE_URL || "postgresql://localhost:5432/catalog";
    _pool = new Pool({
      connectionString: DATABASE_URL,
    });
    _schemaReady = initSchema(_pool).catch((err) => {
      console.error("Schema initialization failed:", err);
      _pool = null;
      _schemaReady = null;
      throw err;
    });
  }
  return _pool;
}

export function schemaReady(): Promise<void> {
  if (!_schemaReady) {
    getPool();
  }
  return _schemaReady!;
}

export async function initSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      logo_path TEXT,
      website TEXT,
      country TEXT,
      hubspot_brand_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sku_code TEXT,
      ean TEXT,
      case_ean TEXT,
      description TEXT,
      category TEXT,
      category_detail TEXT,
      uk_rsp REAL,
      wholesale_case_cost REAL,
      case_size INTEGER,
      vat_percent REAL,
      unit_depth_mm REAL,
      unit_width_mm REAL,
      unit_height_mm REAL,
      unit_net_weight_g REAL,
      unit_gross_weight_g REAL,
      case_depth_mm REAL,
      case_width_mm REAL,
      case_height_mm REAL,
      pallet_qty INTEGER,
      layer_qty INTEGER,
      energy_kj_per_100 TEXT,
      energy_kcal_per_100 TEXT,
      fat_per_100 TEXT,
      saturates_per_100 TEXT,
      carbs_per_100 TEXT,
      sugars_per_100 TEXT,
      fibre_per_100 TEXT,
      protein_per_100 TEXT,
      salt_per_100 TEXT,
      energy_kj_per_serving TEXT,
      energy_kcal_per_serving TEXT,
      fat_per_serving TEXT,
      saturates_per_serving TEXT,
      carbs_per_serving TEXT,
      sugars_per_serving TEXT,
      fibre_per_serving TEXT,
      protein_per_serving TEXT,
      salt_per_serving TEXT,
      serving_type TEXT,
      ingredients TEXT,
      allergens TEXT,
      country_of_origin TEXT,
      manufacturer_name TEXT,
      manufacturer_address TEXT,
      shelf_life_days INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      image_type TEXT CHECK(image_type IN ('hero', 'pack', 'lifestyle', 'nutritional')),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS brand_images (
      id SERIAL PRIMARY KEY,
      brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      image_type TEXT CHECK(image_type IN ('logo', 'hero', 'lifestyle')),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
