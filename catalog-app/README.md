# Product Catalog

Product catalog API for PluginBrands.

## Role in the System

This is a standalone data store for product specifications, brand information, and product images. It serves as the source of truth for the buyer deck generation skill.

This application is NOT directly connected to HubSpot. It maintains its own Postgres database with manually curated product data.

## Production

The app is deployed on Railway with auto-deploy from the `main` branch.

**Live URL:** `https://claudecoworkpluginlearning-production.up.railway.app`

### How deploys work

1. Push to `main` on GitHub
2. Railway detects the change (watches `catalog-app/**`)
3. Builds using the `Dockerfile` in this directory
4. Deploys automatically — health check hits `/api/health`

### Infrastructure

- **Hosting:** Railway (Dockerfile builder)
- **Database:** Railway Postgres (auto-linked via `DATABASE_URL`)
- **Volume:** Persistent volume mounted at `/data` — stores uploaded images
- **Domain:** `claudecoworkpluginlearning-production.up.railway.app`

### Railway environment variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `CATALOG_APP_URL` | `https://claudecoworkpluginlearning-production.up.railway.app` | App's own public URL — used for image URLs |
| `CATALOG_API_KEY` | *(secret)* | Bearer token for API authentication |
| `DATABASE_URL` | *(auto-linked)* | Postgres connection string |
| `DATA_DIR` | `/data` | Points to the persistent volume (images) |
| `NODE_ENV` | `production` | Node environment |

## Local Development

```bash
npm install
npm run dev
```

The app runs on `http://localhost:4100`.

### Environment variables

Create a `.env.local` file:

```bash
CATALOG_APP_URL=http://localhost:4100
CATALOG_API_KEY=your-dev-key
DATABASE_URL=postgresql://localhost:5432/catalog
```

- `CATALOG_APP_URL` — The app's public URL. Locally this is `http://localhost:4100`. On Railway it's the production domain. Used to build image URLs.
- `CATALOG_API_KEY` — Bearer token for API authentication. All `/api/*` requests must include `Authorization: Bearer <key>`.
- `DATABASE_URL` — Postgres connection string.

`DATA_DIR` is optional locally — defaults to `./data` relative to the project root.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Postgres (via node-postgres / `pg`)
- shadcn/ui components
- Tailwind CSS 4
- Vitest (testing)
- Docker (production)

## Database Schema

The Postgres database is hosted on Railway and auto-creates tables on first run.

### brands
- `id` (INTEGER PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `description` (TEXT)
- `logo_path` (TEXT)
- `website` (TEXT)
- `country` (TEXT)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### products
- `id` (INTEGER PRIMARY KEY)
- `brand_id` (INTEGER, FK to brands)
- `name` (TEXT NOT NULL)
- `sku_code` (TEXT)
- `ean` (TEXT)
- `case_ean` (TEXT)
- `description` (TEXT)
- `category` (TEXT)
- `category_detail` (TEXT)
- `uk_rsp` (REAL) - UK retail selling price
- `wholesale_case_cost` (REAL)
- `case_size` (INTEGER) - units per case
- `vat_percent` (REAL)
- Unit dimensions: `unit_depth_mm`, `unit_width_mm`, `unit_height_mm`
- Unit weights: `unit_net_weight_g`, `unit_gross_weight_g`
- Case dimensions: `case_depth_mm`, `case_width_mm`, `case_height_mm`
- Pallet info: `pallet_qty`, `layer_qty`
- Nutritional data (per 100g and per serving): energy, fat, saturates, carbs, sugars, fibre, protein, salt
- `serving_type` (TEXT)
- `ingredients` (TEXT)
- `allergens` (TEXT)
- `country_of_origin` (TEXT)
- `manufacturer_name` (TEXT)
- `manufacturer_address` (TEXT)
- `shelf_life_days` (INTEGER)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### product_images
- `id` (SERIAL PRIMARY KEY)
- `product_id` (INTEGER, FK to products)
- `file_path` (TEXT NOT NULL)
- `image_type` (TEXT) - one of: `hero`, `pack`, `lifestyle`, `nutritional`
- `sort_order` (INTEGER)
- `created_at` (TIMESTAMPTZ)

### brand_images
- `id` (SERIAL PRIMARY KEY)
- `brand_id` (INTEGER, FK to brands)
- `file_path` (TEXT NOT NULL)
- `image_type` (TEXT) - one of: `logo`, `hero`, `lifestyle`
- `sort_order` (INTEGER)
- `created_at` (TIMESTAMPTZ)

## API Endpoints

All `/api/*` routes require authentication via `Authorization: Bearer <CATALOG_API_KEY>` header, except:
- `GET /api/images/[...path]` — public (image URLs are embedded in decks)
- `GET /api/health` — public (Railway health check)

### Brands

**GET** `/api/brands` — Returns all brands with product counts and logo URL

**GET** `/api/brands/[id]` — Returns brand details with all products and brand images

**POST** `/api/brands` — Creates a new brand

**PUT** `/api/brands/[id]` — Updates an existing brand

**DELETE** `/api/brands/[id]` — Deletes a brand (cascades to products)

### Products

**GET** `/api/products?brand_id=N` — Returns all products for a brand

**GET** `/api/products/[id]` — Returns product details with images (image URLs built using `CATALOG_APP_URL`)

**POST** `/api/products` — Creates a new product

**PUT** `/api/products/[id]` — Updates an existing product

**DELETE** `/api/products/[id]` — Deletes a product (cascades to images)

### Product Images

**POST** `/api/products/[id]/images` — Uploads a new image (`multipart/form-data` with `file`, optional `image_type` and `sort_order`)

**DELETE** `/api/products/[id]/images/[imageId]` — Deletes a product image

### Brand Images

**GET** `/api/brands/[id]/images` — Returns all images for a brand

**POST** `/api/brands/[id]/images` — Uploads a brand image (`multipart/form-data` with `file`, optional `image_type` and `sort_order`)

**DELETE** `/api/brands/[id]/images/[imageId]` — Deletes a brand image

### Image Serving

**GET** `/api/images/[...path]` — Serves image files from `{DATA_DIR}/images/` (public, no auth required)

## Key Modules

- `src/lib/paths.ts` — Centralised data paths (`IMAGES_DIR`, `ASSETS_DIR`), configurable via `DATA_DIR` env var
- `src/lib/auth.ts` — API key authentication wrapper (`withAuth`)
- `src/lib/db.ts` — Postgres connection pool and schema initialization
- `src/lib/queries.ts` — All database CRUD operations for brands, products, and images

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `npm run dev` | Start dev server on port 4100 |
| `build` | `npm run build` | Build production bundle (standalone output) |
| `start` | `npm start` | Start production server |
| `lint` | `npm run lint` | Run ESLint |
| `test` | `npm test` | Run Vitest tests |
| `test:watch` | `npm run test:watch` | Run Vitest tests (watch mode) |
| `seed` | `npm run seed` | Seed database with sample data |
