export interface Brand {
  id: number;
  name: string;
  description: string | null;
  logo_path: string | null;
  website: string | null;
  country: string | null;
  hubspot_brand_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandWithCount extends Brand {
  product_count: number;
  logo_url: string | null;
}

export interface Product {
  id: number;
  brand_id: number;
  name: string;
  sku_code: string | null;
  ean: string | null;
  case_ean: string | null;
  description: string | null;
  category: string | null;
  category_detail: string | null;
  uk_rsp: number | null;
  wholesale_case_cost: number | null;
  case_size: number | null;
  vat_percent: number | null;
  unit_depth_mm: number | null;
  unit_width_mm: number | null;
  unit_height_mm: number | null;
  unit_net_weight_g: number | null;
  unit_gross_weight_g: number | null;
  case_depth_mm: number | null;
  case_width_mm: number | null;
  case_height_mm: number | null;
  pallet_qty: number | null;
  layer_qty: number | null;
  energy_kj_per_100: string | null;
  energy_kcal_per_100: string | null;
  fat_per_100: string | null;
  saturates_per_100: string | null;
  carbs_per_100: string | null;
  sugars_per_100: string | null;
  fibre_per_100: string | null;
  protein_per_100: string | null;
  salt_per_100: string | null;
  energy_kj_per_serving: string | null;
  energy_kcal_per_serving: string | null;
  fat_per_serving: string | null;
  saturates_per_serving: string | null;
  carbs_per_serving: string | null;
  sugars_per_serving: string | null;
  fibre_per_serving: string | null;
  protein_per_serving: string | null;
  salt_per_serving: string | null;
  serving_type: string | null;
  ingredients: string | null;
  allergens: string | null;
  country_of_origin: string | null;
  manufacturer_name: string | null;
  manufacturer_address: string | null;
  shelf_life_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: number;
  product_id: number;
  file_path: string;
  image_type: "hero" | "pack" | "lifestyle" | "nutritional" | null;
  sort_order: number | null;
  created_at: string;
}

export interface BrandImage {
  id: number;
  brand_id: number;
  file_path: string;
  image_type: "logo" | "hero" | "lifestyle" | null;
  sort_order: number | null;
  created_at: string;
}

export interface ProductWithImages extends Product {
  images: ProductImage[];
  brand_name?: string;
}

export interface BrandDetail extends Brand {
  products: Product[];
  brand_images: BrandImage[];
}

export type BrandInput = Omit<Brand, "id" | "created_at" | "updated_at">;
export type ProductInput = Omit<Product, "id" | "created_at" | "updated_at">;
