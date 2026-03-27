# Deck Generator Skill — Design Notes

## What We Built

We rebuilt the Gamma deck generation system into a PluginBrands-branded sales deck. The pipeline:

1. **Catalog App** (SQLite) holds brands, products, and product images
2. **gamma-input.ts** builds structured markdown — title slide, Who We Are, What We Can Do Together, brand intro, product range, deep dives (max 3), commercial summary, next steps
3. **gamma-client.ts** sends the markdown to Gamma's API with `chimney-dust` theme, `textMode: "preserve"`, `noImages` (we supply our own), 16:9 cards
4. **Gamma API route** (`/api/decks/gamma`) ties it together — takes `brand_id`, `product_ids`, `prospect_name`, optional `message` and `prospect_logo_url`

Product images are served via ngrok tunnel URL so Gamma can fetch them during generation.

### Deck Structure

| Slide | Content |
|-------|---------|
| Title | "Prepared for {Prospect}" — brand name, message, PB logo + prospect logo |
| Who We Are | PB overview — 20+ Brands, 100+ Buyers, UK & International |
| What We Can Do Together | Incredible Products, Products Your Team Will Love, Supply Chain Support, Brand Building |
| Brand Intro | Brand name, description, country, website |
| The Range | Product grid — name, RSP, hero images |
| Deep Dives (x3) | Per-product detail — image, category, description, pricing, case size, ingredients |
| Commercial Summary | Table — Product, RSP, Case Size, Case Cost |
| Next Steps | PB logo, CTA to arrange tasting or discuss terms |

### Theme Iteration

Went through five Gamma themes before settling:
- `founder` — too startup-y
- `default-dark` — purple/blue accents, looked awful
- `coal` — good colors but geometric/techy font
- **`chimney-dust`** — dark charcoal, clean corporate font, formal. This is the one.

### Gamma Limitations Discovered

- **No per-slide theming** — theme is global, so we can't do dark intro slides + light product slides
- **AI interprets markdown creatively** — layout hints (tables, image placement) are suggestions, not instructions. Gamma's AI decides final positioning
- **Logo placement is approximate** — we provide two logos and Gamma tends to spread them diagonally for visual balance. Can't force stacked/side-by-side

## The Skill Concept

### Goal

A Claude Code skill (`generate-buyer-deck`) that orchestrates three systems to produce a sales deck:

```
HubSpot (buyer data) + Catalog App (products) + Gamma (deck generation)
```

### Workflow

```
1. Identify the buyer
   - User names a buyer, or skill prompts for one
   - Resolve to HubSpot Company record
   - Pull company domain for prospect logo (via Clearbit or similar)

2. Identify the brands
   - Query HubSpot Brands (0-970) associated with this buyer
   - Cross-reference with Catalog App brands (by name match)
   - Present options if multiple brands available
   - Flag if a brand exists in HubSpot but not in catalog (no product data)

3. Get deck intent
   - Ask user what the deck is for: intro pitch, range review, new product launch
   - This drives the title slide message

4. Generate
   - Call /api/decks/gamma for each brand
   - Return Gamma URL(s) to user

5. Deliver
   - Share links
   - Note that logos/layout can be manually adjusted in Gamma's editor
```

### Data Flow

```
HubSpot Company (buyer)
  └── domain → prospect logo URL
  └── associated Buyer Deals
        └── associated Brands (0-970)
              └── client_name_sync → match to Catalog App brand.name
                    └── Catalog App brand → products + images
                          └── /api/decks/gamma → Gamma URL
```

### Open Design Questions

**One deck per brand vs. multi-brand deck?**
Current code handles one brand per deck. For buyers with multiple brands, generate separate decks. Simpler, and each deck stays focused. Multi-brand decks would need code changes to gamma-input.ts.

**Prospect logo sourcing:**
Options: auto from HubSpot company domain (Clearbit API), manual URL from user, or PB logo only. Clearbit would be seamless but adds a dependency.

**Brand matching between HubSpot and Catalog:**
HubSpot Brand `client_name_sync` = "MOJU", Catalog App `brands.name` = "MOJU". Exact match works for now. Fuzzy matching adds complexity we probably don't need yet.

**Missing catalog data:**
If a brand is in HubSpot but not in the catalog app, the skill should report this clearly rather than silently failing. It could offer to create a stub brand record, but populating products/images is a separate workflow.

**Deck type / template variants:**
One template is enough to start. The `message` field on the title slide captures the intent. If we later need structurally different decks (e.g., range review skips "Who We Are"), that's a template variant — but not needed yet.

### Prerequisites

- Catalog app running (`localhost:4100`)
- ngrok tunnel running (`TUNNEL_URL` set)
- `GAMMA_API_KEY` set
- `hubspot-api-query` skill invoked first (for HubSpot API patterns)

### Key Files

| File | Role |
|------|------|
| `src/lib/gamma-input.ts` | Builds slide markdown from brand + products |
| `src/lib/gamma-client.ts` | Gamma API client (create, poll) |
| `src/lib/deck-template.ts` | HTML deck template (alternative to Gamma) |
| `src/lib/pb-assets.ts` | PB logo as base64 data URI |
| `src/app/api/decks/gamma/route.ts` | API route — ties it all together |
| `data/assets/pluginbrands-logo-white.webp` | PB white logo (36KB) |
