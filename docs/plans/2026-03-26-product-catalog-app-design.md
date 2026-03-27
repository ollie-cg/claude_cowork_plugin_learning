# Product Catalog App Design

## Purpose

Standalone product catalog app that replaces HubSpot as the source of truth for brand/product data at PluginBrands. Stores complete product records (specs, pricing, nutritionals, images) so that:

1. Operators can browse and manage product catalogs per brand via a web UI
2. Claude Code skills can query the API to generate Gamma pitch decks with real product data and images

## Decisions

- **Source of truth:** The catalog app (not HubSpot)
- **Initial data:** Start empty (no HubSpot import)
- **Gamma integration:** Not in the app UI — Claude Code skills query the API and handle deck generation separately
- **Image storage:** Local filesystem for now, cloud later
- **Stack:** Next.js (App Router) + SQLite (better-sqlite3) + shadcn/ui
- **Auth:** None for v1 (internal tool)

## Data Model

### brands

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| name | TEXT NOT NULL | e.g. "MOJU", "Love Corn" |
| description | TEXT | Brand overview |
| logo_path | TEXT | Path to logo image |
| website | TEXT | Brand website URL |
| country | TEXT | Country of origin |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### products

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| brand_id | INTEGER FK | References brands.id |
| name | TEXT NOT NULL | e.g. "Ginger Shot 60ml" |
| sku_code | TEXT | Vendor SKU |
| ean | TEXT | Retail EAN barcode |
| case_ean | TEXT | Case EAN |
| description | TEXT | Product description |
| category | TEXT | e.g. "Drinks", "Snacks" |
| category_detail | TEXT | Sub-category |
| uk_rsp | REAL | Retail selling price |
| wholesale_case_cost | REAL | |
| case_size | INTEGER | Units per case |
| vat_percent | REAL | |
| unit_depth_mm | REAL | Single unit dimensions |
| unit_width_mm | REAL | |
| unit_height_mm | REAL | |
| unit_net_weight_g | REAL | |
| unit_gross_weight_g | REAL | |
| case_depth_mm | REAL | Outer case dimensions |
| case_width_mm | REAL | |
| case_height_mm | REAL | |
| pallet_qty | INTEGER | |
| layer_qty | INTEGER | |
| energy_kj_per_100 | TEXT | Nutritional per 100g/ml |
| energy_kcal_per_100 | TEXT | |
| fat_per_100 | TEXT | |
| saturates_per_100 | TEXT | |
| carbs_per_100 | TEXT | |
| sugars_per_100 | TEXT | |
| fibre_per_100 | TEXT | |
| protein_per_100 | TEXT | |
| salt_per_100 | TEXT | |
| energy_kj_per_serving | TEXT | Nutritional per serving |
| energy_kcal_per_serving | TEXT | |
| fat_per_serving | TEXT | |
| saturates_per_serving | TEXT | |
| carbs_per_serving | TEXT | |
| sugars_per_serving | TEXT | |
| fibre_per_serving | TEXT | |
| protein_per_serving | TEXT | |
| salt_per_serving | TEXT | |
| serving_type | TEXT | e.g. "per 60ml shot", "per 35g bag" |
| ingredients | TEXT | Full ingredients list |
| allergens | TEXT | Allergen declaration |
| country_of_origin | TEXT | |
| manufacturer_name | TEXT | |
| manufacturer_address | TEXT | |
| shelf_life_days | INTEGER | Minimum shelf life on delivery |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### product_images

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| product_id | INTEGER FK | References products.id |
| file_path | TEXT NOT NULL | Path relative to images dir |
| image_type | TEXT | "hero", "pack", "lifestyle", "nutritional" |
| sort_order | INTEGER | Display ordering |
| created_at | DATETIME | |

## UI Pages

### Brands list (`/`)
Grid/table of all brands. Shows logo thumbnail, name, product count. Click to view brand.

### Brand detail (`/brands/[id]`)
Brand info header (logo, name, description, website). Table of all products: name, SKU, category, RSP, case size. Click product to view/edit. Add product button.

### Product detail/edit (`/products/[id]`)
Full product record with all fields in collapsible sections:
- Identity (name, SKU, EAN, description, category)
- Commercial (RSP, wholesale cost, case size, VAT)
- Physical (dimensions, weight)
- Case & Pallet (case dimensions, pallet/layer qty)
- Nutritional (per serving + per 100g)
- Other (ingredients, allergens, origin, manufacturer, shelf life)

Image gallery with drag-and-drop upload. Edit fields inline.

### Add brand / Add product
Modal or dedicated pages for creating new records.

## API Routes (for Claude skills)

| Route | Method | Returns |
|-------|--------|---------|
| `/api/brands` | GET | All brands with product counts |
| `/api/brands/[id]` | GET | Brand detail + all products |
| `/api/products/[id]` | GET | Full product with image URLs |
| `/api/brands/[id]/products` | GET | All products for a brand |
| `/api/images/[...path]` | GET | Serve image file |

All JSON responses. Image URLs are absolute so Gamma can reference them directly.

## Project Structure

```
catalog-app/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Brands list
│   │   ├── brands/[id]/page.tsx        # Brand detail
│   │   ├── products/[id]/page.tsx      # Product detail/edit
│   │   └── api/
│   │       ├── brands/route.ts         # Brand CRUD
│   │       ├── brands/[id]/route.ts
│   │       ├── products/route.ts       # Product CRUD
│   │       ├── products/[id]/route.ts
│   │       ├── products/[id]/images/route.ts  # Image upload
│   │       └── images/[...path]/route.ts      # Serve images
│   ├── components/
│   │   ├── brand-card.tsx
│   │   ├── product-table.tsx
│   │   ├── product-form.tsx
│   │   ├── image-upload.tsx
│   │   └── ui/                         # shadcn components
│   ├── lib/
│   │   ├── db.ts                       # SQLite connection + schema init
│   │   └── queries.ts                  # Database query functions
│   └── types/
│       └── index.ts
├── data/
│   ├── catalog.db                      # SQLite database file
│   └── images/                         # Uploaded images
├── package.json
├── next.config.js
├── tsconfig.json
└── tailwind.config.ts
```

## Implementation Steps

1. **Scaffold Next.js project** — `create-next-app` with TypeScript, Tailwind, App Router
2. **Set up SQLite** — Install better-sqlite3, create db.ts with schema initialization, write query functions
3. **Build API routes** — CRUD for brands and products, image upload/serve
4. **Build brands list page** — Grid of brand cards with logos and product counts
5. **Build brand detail page** — Brand header + product table + add product
6. **Build product detail page** — Full form with collapsible sections + image gallery
7. **Add image upload** — Drag-and-drop component, save to local filesystem
8. **Seed with test data** — Add one brand with a few products to verify everything works
9. **Test with Claude** — Write a quick test to verify Claude can query the API and get structured product data back
