import Database from "better-sqlite3";
import { DB_PATH } from "./paths";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      logo_path TEXT,
      website TEXT,
      country TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      image_type TEXT CHECK(image_type IN ('hero', 'pack', 'lifestyle', 'nutritional')),
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
}
