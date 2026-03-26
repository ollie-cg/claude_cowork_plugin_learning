import { getDb } from "./db";
import { createBrand, createProduct } from "./queries";

const db = getDb();

const moju = createBrand(db, {
  name: "MOJU",
  description: "Cold-pressed functional shots",
  logo_path: null,
  website: "https://www.mojudrinks.com",
  country: "United Kingdom",
});

createProduct(db, {
  brand_id: moju.id,
  name: "Ginger Shot 60ml",
  sku_code: "MOJU-GS60",
  ean: "5060421980018",
  description: "Cold-pressed ginger shot with lemon and cayenne pepper",
  category: "Drinks",
  category_detail: "Functional Shots",
  uk_rsp: 1.80,
  wholesale_case_cost: 10.80,
  case_size: 12,
  vat_percent: 0,
  unit_depth_mm: 38,
  unit_width_mm: 38,
  unit_height_mm: 95,
  unit_net_weight_g: 60,
  unit_gross_weight_g: 85,
  energy_kj_per_100: "92",
  energy_kcal_per_100: "22",
  fat_per_100: "0.1",
  saturates_per_100: "0",
  carbs_per_100: "4.3",
  sugars_per_100: "3.2",
  fibre_per_100: "0.3",
  protein_per_100: "0.3",
  salt_per_100: "0.01",
  serving_type: "per 60ml shot",
  energy_kj_per_serving: "55",
  energy_kcal_per_serving: "13",
  fat_per_serving: "0.1",
  saturates_per_serving: "0",
  carbs_per_serving: "2.6",
  sugars_per_serving: "1.9",
  fibre_per_serving: "0.2",
  protein_per_serving: "0.2",
  salt_per_serving: "0.01",
  ingredients: "Apple Juice (55%), Ginger Juice (25%), Lemon Juice (15%), Cayenne Pepper (5%)",
  allergens: "None",
  country_of_origin: "United Kingdom",
  manufacturer_name: "MOJU Ltd",
  manufacturer_address: "London, UK",
  shelf_life_days: 55,
});

createProduct(db, {
  brand_id: moju.id,
  name: "Turmeric Shot 60ml",
  sku_code: "MOJU-TS60",
  description: "Cold-pressed turmeric shot with ginger and black pepper",
  category: "Drinks",
  category_detail: "Functional Shots",
  uk_rsp: 1.80,
  wholesale_case_cost: 10.80,
  case_size: 12,
});

const loveCorn = createBrand(db, {
  name: "Love Corn",
  description: "Premium roasted corn snacks",
  logo_path: null,
  website: "https://www.lovecorn.com",
  country: "United Kingdom",
});

createProduct(db, {
  brand_id: loveCorn.id,
  name: "Sea Salt 45g",
  sku_code: "LC-SS45",
  description: "Crunchy roasted corn with sea salt",
  category: "Snacks",
  category_detail: "Corn Snacks",
  uk_rsp: 1.20,
  wholesale_case_cost: 8.40,
  case_size: 12,
});

console.log("Seeded: 2 brands, 3 products");
