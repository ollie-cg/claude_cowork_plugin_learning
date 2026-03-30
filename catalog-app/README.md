# Product Catalog & Deck Generator

Product catalog and deck generator for PluginBrands.

## Role in the System

This is a standalone data store for product specifications, brand information, and product images. It serves as the source of truth for the `generate-buyer-deck` skill, which uses catalog data to generate buyer presentations via the Gamma API.

This application is NOT directly connected to HubSpot. It maintains its own SQLite database with manually curated product data.

## Production

The app is deployed on Railway with auto-deploy from the `main` branch.

**Live URL:** `https://claudecoworkpluginlearning-production.up.railway.app`

### How deploys work

1. Push to `main` on GitHub
2. Railway detects the change (watches `catalog-app/**`)
3. Builds using the `Dockerfile` in this directory
4. Deploys automatically — health check hits `/api/brands`

### Infrastructure

- **Hosting:** Railway (Dockerfile builder)
- **Volume:** Persistent volume mounted at `/data` — stores SQLite DB and uploaded images
- **Domain:** `claudecoworkpluginlearning-production.up.railway.app`

### Railway environment variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `CATALOG_APP_URL` | `https://claudecoworkpluginlearning-production.up.railway.app` | App's own public URL — used for image URLs in Gamma decks |
| `DATA_DIR` | `/data` | Points to the persistent volume (DB + images) |
| `GAMMA_API_KEY` | `sk-gamma-...` | Gamma API authentication |
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
GAMMA_API_KEY=your_gamma_api_key_here
CATALOG_APP_URL=http://localhost:4100
```

- `GAMMA_API_KEY` — Required for deck generation. API key from Gamma.app.
- `CATALOG_APP_URL` — The app's public URL. Locally this is `http://localhost:4100`. On Railway it's the production domain. Used to build image URLs embedded in generated decks.

`DATA_DIR` is optional locally — defaults to `./data` relative to the project root.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- SQLite (better-sqlite3)
- shadcn/ui components
- Tailwind CSS 4
- Vitest (testing)
- Docker (production)

## Database Schema

The SQLite database is located at `{DATA_DIR}/catalog.db` and auto-creates on first run.

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
- `id` (INTEGER PRIMARY KEY)
- `product_id` (INTEGER, FK to products)
- `file_path` (TEXT NOT NULL)
- `image_type` (TEXT) - one of: `hero`, `pack`, `lifestyle`, `nutritional`
- `sort_order` (INTEGER)
- `created_at` (DATETIME)

## API Endpoints

### Brands

**GET** `/api/brands` — Returns all brands with product counts

**GET** `/api/brands/[id]` — Returns brand details with all products

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

**GET** `/api/images/[...path]` — Serves product image files from `{DATA_DIR}/images/`

### Deck Generation

**POST** `/api/decks/gamma` — Generates a buyer deck via Gamma API

Request body:
```json
{
  "brand_id": 1,
  "product_ids": [1, 2, 3],
  "prospect_name": "Waitrose",
  "message": "Optional custom message",
  "prospect_logo_url": "https://example.com/logo.png"
}
```

Requires `GAMMA_API_KEY` and `CATALOG_APP_URL` environment variables.

## Key Modules

- `src/lib/paths.ts` — Centralised data paths (`DB_PATH`, `IMAGES_DIR`, `ASSETS_DIR`), configurable via `DATA_DIR` env var
- `src/lib/db.ts` — Database initialisation and connection management (singleton SQLite, WAL mode, foreign keys)
- `src/lib/queries.ts` — All database CRUD operations for brands, products, and images
- `src/lib/gamma-client.ts` — Gamma API client (`createGammaDeck`, `pollGammaGeneration`)
- `src/lib/gamma-input.ts` — Builds markdown slide content from brand/product data for Gamma

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
