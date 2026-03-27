# MOJU Product Data Scrape — 2026-03-26

## What was done

Scraped the full MOJU product catalog from [mojudrinks.com/collections/all](https://mojudrinks.com/collections/all) and loaded it into the catalog app's SQLite database with locally stored images.

## Brand

- **Name:** MOJU
- **Website:** https://mojudrinks.com
- **Country:** United Kingdom
- **Description:** Cold-pressed functional shots made from the highest quality fresh ingredients. No added sugar, no synthetic vitamins, no preservatives.
- **DB ID:** 1

## Products (6)

| DB ID | Product | RSP | Category | Images |
|-------|---------|-----|----------|--------|
| 10 | Ginger Dosing Bottle 420ml | £6.95 | Functional Shots | 4 |
| 11 | Turmeric Dosing Bottle 420ml | £6.95 | Functional Shots | 5 |
| 12 | Extra Strength Ginger Dosing Bottle 420ml | £7.88 | Functional Shots | 2 |
| 13 | Hot Mango Immunity Dosing Bottle 420ml | £6.95 | Functional Shots - Immunity | 5 |
| 14 | Power Greens Immunity Dosing Bottle 420ml | £6.95 | Functional Shots - Immunity | 5 |
| 15 | Honey Lemon Immunity Dosing Bottle 420ml | £6.95 | Functional Shots - Immunity | 3 |

**Total: 24 images** stored at `catalog-app/data/images/1/`

## Data captured per product

- Full description from product page
- Ingredients list with percentages
- Nutritional info per 100ml and per 60ml serving (energy kJ/kcal, fat, saturates, carbs, sugars, protein, salt)
- UK RSP pricing
- Case size (4 bottles per case)
- Allergens, country of origin, manufacturer
- Image types: hero, lifestyle, pack/benefits, nutritional/ingredients

## Image types breakdown

| Type | Count | Description |
|------|-------|-------------|
| hero | 7 | Main product shot (white background, dosing bottles) |
| lifestyle | 5 | In-use / model / context photos |
| pack | 5 | Benefits infographics and pack shots |
| nutritional | 5 | Ingredients breakdown graphics |

## Method

1. Fetched collections page to identify 6 core shot products (excluded bundles/packs/accessories)
2. Scraped each product page via WebFetch for text data (descriptions, ingredients, nutritionals)
3. Used Puppeteer to extract exact CDN image URLs from each product page
4. Downloaded images via `curl` to local filesystem
5. Inserted brand, products, and image records into SQLite via Python script

## Notes

- The 420ml dosing bottles are the core retail product — MOJU sells these in packs of 4 (28 daily 60ml shots)
- Prices scraped are the single-bottle equivalent from the 4-pack price (£27.80 / 4 = £6.95)
- Extra Strength Ginger has fewer gallery images on the MOJU site — only 2 captured
- Existing seed data (Ginger Shot 60ml, Turmeric Shot 60ml) was replaced with the full scraped data
