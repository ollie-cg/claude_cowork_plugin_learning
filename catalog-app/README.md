# Product Catalog & Deck Generator

Product catalog and deck generator for PluginBrands.

## Role in the System

This is a standalone data store for product specifications, brand information, and product images. It serves as the source of truth for the `generate-buyer-deck` skill, which uses catalog data to generate buyer presentations via the Gamma API.

This application is NOT directly connected to HubSpot. It maintains its own SQLite database with manually curated product data.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- SQLite (better-sqlite3)
- shadcn/ui components
- Tailwind CSS 4
- Vitest (testing)

## Running Locally

```bash
npm install
npm run dev
```

The app runs on `http://localhost:4100`.

### Required Environment Variables

Create a `.env.local` file:

```bash
GAMMA_API_KEY=your_gamma_api_key_here
TUNNEL_URL=https://your-ngrok-url.ngrok.io
```

- `GAMMA_API_KEY` - Required for deck generation. API key from Gamma.app.
- `TUNNEL_URL` - Required for deck generation. Public ngrok URL pointing to localhost:4100. Used to embed product images in generated decks.

## Database Schema

The SQLite database is located at `/Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app/data/catalog.db` and auto-creates on first run.

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

**GET** `/api/brands`
- Returns all brands with product counts
- Response: `BrandWithCount[]`

**GET** `/api/brands/[id]`
- Returns brand details with all products
- Response: `BrandDetail`

**POST** `/api/brands`
- Creates a new brand
- Request body: `BrandInput`
- Response: `Brand`

**PUT** `/api/brands/[id]`
- Updates an existing brand
- Request body: `BrandInput`
- Response: `Brand`

**DELETE** `/api/brands/[id]`
- Deletes a brand (cascades to products)

### Products

**GET** `/api/products`
- Query param: `brand_id` (required)
- Returns all products for a brand
- Response: `Product[]`

**GET** `/api/products/[id]`
- Returns product details with images and brand name
- Response: `ProductWithImages`

**POST** `/api/products`
- Creates a new product
- Request body: `Partial<ProductInput> & { brand_id: number; name: string }`
- Response: `Product`

**PUT** `/api/products/[id]`
- Updates an existing product
- Request body: `Partial<ProductInput> & { brand_id: number; name: string }`
- Response: `Product`

**DELETE** `/api/products/[id]`
- Deletes a product (cascades to images)

### Product Images

**POST** `/api/products/[id]/images`
- Uploads a new image for a product
- Request: `multipart/form-data` with `file` field
- Optional fields: `image_type`, `sort_order`
- Response: `ProductImage`

**DELETE** `/api/products/[id]/images/[imageId]`
- Deletes a product image

**GET** `/api/images/[...path]`
- Serves product image files
- Path: relative file path from `public/uploads/`

### Deck Generation

**POST** `/api/decks/gamma`

Generates a buyer presentation deck via Gamma API.

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

Response (success):
```json
{
  "gammaUrl": "https://gamma.app/docs/...",
  "gammaId": "abc123",
  "exportUrl": null,
  "generationId": "gen_xyz"
}
```

Response (error):
```json
{
  "error": "Error message"
}
```

Deck structure:
1. Title slide (with prospect name, brand, optional logos)
2. Who We Are (PluginBrands intro)
3. What We Can Do Together (value props)
4. Brand introduction
5. Product overview (all products)
6-8. Product deep dives (up to 3 products)
9. Commercial summary table
10. Next steps

## Key Modules

### `/Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app/src/lib/db.ts`
Database initialization and connection management. Exports `getDb()` which returns a singleton SQLite connection. Auto-creates schema on first run with foreign keys enabled and WAL mode.

### `/Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app/src/lib/queries.ts`
All database queries. Exports functions for CRUD operations on brands, products, and images. Key functions:
- `getAllBrands()`, `getBrandById()`, `createBrand()`, `updateBrand()`, `deleteBrand()`
- `getProductsByBrand()`, `getProductById()`, `getProductsByIds()`, `createProduct()`, `updateProduct()`, `deleteProduct()`
- `createProductImage()`, `getImagesByProduct()`, `deleteProductImage()`

### `/Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app/src/lib/gamma-client.ts`
Gamma API client. Exports:
- `createGammaDeck(options)` - Creates a new deck generation job
- `pollGammaGeneration(generationId, options)` - Polls until generation completes or fails

### `/Users/ollie/projects/plugin/claude_cowork_plugin_learning/catalog-app/src/lib/gamma-input.ts`
Deck content builder. Exports `buildGammaInputText(options)` which generates markdown slides from brand and product data. Handles image URLs via tunnel, formats pricing, builds product tables, and structures the narrative flow.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GAMMA_API_KEY` | Yes (for deck generation) | API key for Gamma.app deck generation service |
| `TUNNEL_URL` | Yes (for deck generation) | Public ngrok URL pointing to localhost:4100. Used to embed product images in decks. |

Without these variables, the app will run but deck generation will fail.

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `npm run dev` | Start Next.js dev server on port 4100 |
| `build` | `npm run build` | Build production bundle |
| `start` | `npm start` | Start production server |
| `lint` | `npm run lint` | Run ESLint |
| `test` | `npm test` | Run Vitest tests (run mode) |
| `test:watch` | `npm run test:watch` | Run Vitest tests (watch mode) |
| `seed` | `npm run seed` | Seed database with sample data via `src/lib/seed.ts` |
