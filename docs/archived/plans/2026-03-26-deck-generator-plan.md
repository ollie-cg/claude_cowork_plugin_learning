# Deck Generator Plan — MOJU Prospect Deck

## Goal

Build a deck generator that pulls product data and images from the catalog app and produces a polished pitch deck for a prospect (e.g. a retailer considering stocking MOJU). The deck should be tailored per prospect — selecting relevant products, highlighting pricing, and including product photography.

## Context

The catalog app already stores everything needed:
- Brand info (description, website, country)
- Product details (name, description, RSP, case size, ingredients, nutritionals)
- Product images (hero shots, lifestyle photos, benefits infographics, nutritional breakdowns)
- API endpoints to query all of this programmatically

The design doc (`2026-03-26-product-catalog-app-design.md`) explicitly planned for this: "Claude Code skills can query the API to generate Gamma pitch decks with real product data and images."

## Approach Options

### Option A: Gamma API Integration
Use the [Gamma.app](https://gamma.app) API to generate a presentation. Claude would:
1. Query the catalog API for brand + product data
2. Construct a Gamma-compatible payload with slide content and image URLs
3. Call the Gamma API to generate the deck
4. Return the Gamma share link to the user

**Pros:** Professional, animated presentations; hosted and shareable
**Cons:** Requires Gamma API access/key; external dependency; images must be publicly accessible (catalog images are local)

### Option B: HTML/PDF Generation (Self-contained)
Generate a deck as an HTML file or PDF directly:
1. Query the catalog API for brand + product data
2. Render slides as HTML using a template (could use reveal.js or simple CSS grid)
3. Embed product images as base64 or reference local paths
4. Optionally convert to PDF via Puppeteer

**Pros:** No external dependencies; works with local images; fully customisable
**Cons:** Less polished than Gamma; more template work upfront

### Option C: Hybrid — Template + Manual Gamma
Generate structured markdown/content that a user pastes into Gamma:
1. Query catalog API for data
2. Output a structured brief with slide content, image paths, and talking points
3. User creates the Gamma deck manually using the brief

**Pros:** Quick to build; flexible
**Cons:** Not automated; manual effort per deck

## Recommended: Option B (HTML/PDF) as the starting point

This gives us a fully working, self-contained deck generator with no external dependencies. We can upgrade to Gamma later if needed.

## Deck Structure (Slide Plan)

For a MOJU prospect deck, the slides would be:

| Slide | Content | Data Source |
|-------|---------|-------------|
| 1. Title | MOJU logo, brand name, "Product Range for [Prospect Name]" | Brand name, prospect input |
| 2. Brand Story | Brand description, key selling points, website | `brands.description`, `brands.website` |
| 3. Product Overview | Grid of all products with hero images and RSPs | Products list, hero images, `uk_rsp` |
| 4-N. Product Deep Dives | One slide per product: hero image, description, key ingredients, nutritional highlights, RSP, case size | Full product record + images |
| N+1. Why Stock MOJU | Key benefits (cold-pressed, no added sugar, Vitamin C/D3, etc.) | Derived from product data |
| N+2. Commercial Summary | Table: product name, RSP, case cost, case size, margin calculation | `uk_rsp`, `wholesale_case_cost`, `case_size` |
| N+3. Contact / Next Steps | PluginBrands contact info, prospect-specific CTA | User input |

## Implementation Steps

### Step 1: Deck API Endpoint
Add a new API route to the catalog app:
```
POST /api/decks/generate
Body: { brand_id: number, prospect_name: string, product_ids?: number[] }
Returns: { url: string } (path to generated HTML/PDF)
```

This endpoint:
- Fetches the brand and selected products (or all products if none specified)
- Fetches all associated images
- Renders them into an HTML deck template
- Saves the output to `data/decks/{brand}_{prospect}_{timestamp}.html`
- Returns the URL to access the deck

### Step 2: HTML Deck Template
Create a template in `src/lib/deck-template.ts` that:
- Uses clean CSS with print-friendly styles
- Each "slide" is a full-viewport section
- Embeds images as base64 (so the HTML is self-contained and portable)
- Includes: title slide, brand overview, product grid, per-product slides, commercial table
- Responsive — works on screen and prints to A4/Letter

### Step 3: Deck Serving Route
Add route to serve generated decks:
```
GET /api/decks/[filename]
```
Serves the HTML file from `data/decks/`.

### Step 4: PDF Export (Optional)
If we want PDF output:
- Use Puppeteer (already available) to render the HTML to PDF
- Or use a library like `puppeteer-core` + `@sparticuz/chromium` for serverless

### Step 5: Claude Skill / CLI Integration
Create a Claude Code skill that:
1. Takes a prospect name and brand as input
2. Calls the catalog API to get products
3. Calls the deck generation endpoint
4. Returns the deck URL or opens it in the browser

Example usage:
```
> Generate a MOJU deck for Sainsbury's
```

## File Plan

| File | Purpose |
|------|---------|
| `src/lib/deck-template.ts` | HTML template rendering function |
| `src/app/api/decks/generate/route.ts` | POST endpoint to generate a deck |
| `src/app/api/decks/[filename]/route.ts` | GET endpoint to serve generated decks |
| `data/decks/` | Directory for generated deck files |

## Data Flow

```
User request ("Make a MOJU deck for Tesco")
    ↓
Claude skill or API call
    ↓
POST /api/decks/generate { brand_id: 1, prospect_name: "Tesco" }
    ↓
Fetch brand (MOJU) + all products + all images from DB
    ↓
Render HTML template with embedded images
    ↓
Save to data/decks/moju_tesco_20260326.html
    ↓
Return { url: "/api/decks/moju_tesco_20260326.html" }
    ↓
User opens in browser / downloads PDF
```

## Open Questions

1. **Product selection:** Should decks always include all products, or should the user pick a subset? (e.g. "just the immunity range for Tesco")
2. **Prospect customisation:** Beyond the name, should we support custom messaging per prospect? (e.g. "Tesco is interested in health drinks for their wellness aisle")
3. **Pricing tiers:** The catalog stores a single RSP — should we support prospect-specific pricing in the deck?
4. **Branding:** Should the deck use MOJU branding (their colours/fonts) or PluginBrands branding?
5. **Image quality:** Hero images from the website are 1200px wide — sufficient for deck use, but may want higher-res originals for print
