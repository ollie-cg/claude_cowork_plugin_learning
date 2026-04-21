# Generate Buyer Deck — Skill Design

> **⚠️ DEPRIORITISED (2026-04-21, v1.2.0):** The `generate-buyer-deck` skill was removed from the shipped plugin. This doc is preserved for reference but is not under active development.

## Overview

A Claude Code skill (`generate-buyer-deck`) in the `pluginbrands-toolkit` plugin that orchestrates HubSpot, the Catalog App, and Gamma to produce tailored sales decks for retail buyers. Includes automated visual QA via Puppeteer with auto-retry.

**Location:** `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`

**Invocation:** `Skill(pluginbrands-toolkit:generate-buyer-deck)`

## Dependencies

| Dependency | Purpose | Required? |
|------------|---------|-----------|
| `hubspot-api-query` skill | CRM data model, object IDs, query patterns | Yes |
| Gamma MCP server | `generate` tool for creating presentations | Yes |
| Puppeteer MCP server | `puppeteer_navigate`, `puppeteer_screenshot`, `puppeteer_evaluate` for visual QA | No (QA skipped if unavailable) |
| `CATALOG_APP_URL` env var | Shared hosted catalog app endpoint | Yes |

## Workflow

### Step 1 — Buyer Intelligence Gathering

1. User names a buyer (e.g. "Tesco", "Sainsbury's")
2. Resolve to a HubSpot Company record using `hubspot-api-query` patterns
3. Pull company domain for prospect logo (`https://logo.clearbit.com/{domain}`)
4. Fetch all associated data:
   - Emails
   - Notes
   - Calls
   - Meetings
   - Contacts
   - Deal history
5. Claude synthesises this into a **buyer profile**: who they are, what they've bought before, how they communicate, what their priorities seem to be
6. Claude **proposes buyer motives** — e.g. "Tesco appears focused on health-conscious ranges, they've asked about certifications twice, and pricing sensitivity came up in the last call"
7. User reviews, agrees with, and edits the proposed motives
8. This becomes the strategic foundation for the deck

### Step 2 — Brand & Product Selection

1. Fetch Buyer Deals associated with the Company
2. Follow deal associations to Brand records (object type `0-970`)
3. Match Brand `client_name_sync` to the Catalog App via `GET {CATALOG_APP_URL}/api/brands`
4. For each matched brand, fetch all available products from the catalog
5. Present to user per brand: "MOJU has these products: 1) Ginger Shot, 2) Turmeric Shot, 3) Vitality Pack..."
6. Products associated with the deal are **pre-selected**
7. User confirms or adjusts the selection per brand
8. If a brand exists in HubSpot but not in the catalog, report clearly and skip
9. If multiple brands, user selects which brands to generate decks for

### Step 3 — Deck Narrative & Flow

1. Combine buyer motives (from Step 1) with selected brands/products (from Step 2)
2. Claude proposes the narrative flow:
   - How to position each brand for *this specific buyer*
   - What to emphasise in the brand introduction
   - Which product attributes to highlight in deep dives (e.g. lead with certifications if the buyer cares about sourcing)
   - What commercial angle to lead with
   - The title slide message
3. User reviews and adjusts the narrative direction
4. This drives the content of every slide

### Step 4 — Generate via Gamma

1. Build the markdown input text (see Slide Structure below)
2. Call Gamma MCP `generate` tool with the correct parameters (see Gamma Configuration below)
3. One deck per brand — if multiple brands, generate sequentially
4. Receive `gammaUrl` for each generated deck

### Step 5 — Visual QA & Auto-Retry

1. Open `gammaUrl` with Puppeteer
2. Run the QA checklist (see Visual QA below)
3. If issues found, adjust markdown and regenerate (max 2 retries)
4. Present final result to user with Gamma URL(s) and screenshots

## Slide Structure

Each slide separated by `---` in the markdown input. Content tailored to the buyer based on Steps 1 and 3.

| # | Slide | Content |
|---|-------|---------|
| 1 | **Title** | "Prepared for {Prospect}" — brand name, tailored message from Step 3, PB logo + prospect logo |
| 2 | **Who We Are** | Fixed PB pitch — 20+ Brands, 100+ Buyers, UK & International |
| 3 | **What We Can Do Together** | Fixed — Incredible Products, Supply Chain Support, Brand Building |
| 4 | **Brand Introduction** | Brand name, description, country, website — framed for this buyer's motives |
| 5 | **The Range** | Grid of selected products — name, RSP, hero images |
| 6-8 | **Deep Dives** (max 3) | Per-product detail — image, category, description, pricing, case size, ingredients. Emphasis tailored to buyer motives |
| 9 | **Commercial Summary** | Table — Product, RSP, Case Size, Case Cost |
| 10 | **Next Steps** | PB logo, CTA to arrange tasting or discuss terms |

**Rules:**
- Deep dives capped at 3 products. If more than 3 selected, the top 3 get deep dives; the rest appear only in The Range and Commercial Summary
- Product images referenced as URLs: `{CATALOG_APP_URL}/api/images/{file_path}`
- Slides 1-3 and 10 are intended dark-themed, slides 4-9 light-themed (noting Gamma's global theme limitation — `chimney-dust` is the best compromise)
- The PB logo URL: `https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png`

## Gamma MCP Configuration

Exact parameters for the Gamma MCP `generate` tool:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `inputText` | Built markdown from Step 3 | |
| `format` | `"presentation"` | |
| `textMode` | `"preserve"` | Never `generate` or `condense` |
| `numCards` | `7 + min(selected_products, 3)` | Must not exceed 60 |
| `themeId` | `"chimney-dust"` | Unless user requests different |
| `imageOptions.source` | `"noImages"` | We supply our own via URL |
| `cardOptions.dimensions` | `"16x9"` | Widescreen |
| `cardOptions.headerFooter.bottomRight` | `{ type: "image", source: "custom", src: PB_LOGO_URL, size: "sm" }` | |
| `cardOptions.headerFooter.hideFromFirstCard` | `true` | |
| `cardOptions.headerFooter.hideFromLastCard` | `true` | |
| `exportAs` | Omit unless user requests PDF/PPTX | |

**Iron Laws:**
1. NEVER use `textMode: "generate"` or `"condense"` — our copy is carefully crafted
2. ALWAYS use `source: "noImages"` — we supply product images via URL
3. ALWAYS use `chimney-dust` theme unless user explicitly requests different — use `get_themes` to find alternatives if asked
4. `numCards` must not exceed 60 (Gamma hard limit)

## Visual QA

### Process

1. `puppeteer_navigate` to the `gammaUrl`
2. Wait for full render
3. `puppeteer_screenshot` the full page for overview assessment
4. `puppeteer_evaluate` to inspect DOM — slide count, text content, image elements, table structure
5. Screenshot individual slides by scrolling/targeting slide selectors
6. Evaluate against the checklist

### QA Checklist

| Check | Method | Fail Condition |
|-------|--------|----------------|
| Slide count | DOM query for card/slide elements | Doesn't match expected `numCards` |
| Text truncation | Check overflow properties, look for `...` or clipped containers | Any product name, price, or description cut off |
| Image visibility | Check `<img>` natural dimensions > 0 | Any product image failed to load |
| Table readability | Inspect Commercial Summary table column widths and cell content | Columns collapsed or data wrapping badly |
| Text overlap | Compare bounding boxes of adjacent elements via JS | Elements overlapping by more than 5px |
| Logo presence | Check for PB logo on title and closing slides | Missing or broken |
| Whitespace balance | Screenshot assessment — no slides 80%+ empty or crammed | Visually unbalanced |
| Overall style | Full-page screenshot review | Subjective quality assessment |

## Auto-Retry Logic

**Budget:** Maximum 2 retries (3 total generations). Each retry burns a Gamma credit — Claude must inform the user: "Regenerating — this will use another Gamma credit (retry 1 of 2)."

**Adjustment strategies:**

| Issue | Adjustment |
|-------|-----------|
| Text truncation | Shorten the offending text — trim descriptions, abbreviate |
| Broken images | Verify catalog app URL reachable. If image missing, remove reference |
| Table too wide | Abbreviate column headers, shorten product names |
| Text overlap | Reduce content density — fewer bullet points, shorter paragraphs |
| Slide count wrong | Adjust `numCards`, check `---` separators |
| Empty/crammed slides | Redistribute content between Range overview and Deep Dives |
| Poor overall style | Use `additionalInstructions` parameter for layout hints |

**After max retries:** Present the best version with a summary of remaining issues and suggestions for manual edits in Gamma's editor.

## Error Handling

### Missing Data

| Scenario | Behaviour |
|----------|-----------|
| Buyer not found in HubSpot | Tell user, ask for correct company name or ID |
| Brand in HubSpot but not in Catalog App | Report: "MOJU exists in HubSpot but has no catalog data. Skipping." |
| Brand has zero products | Report: "MOJU is in the catalog but has no products yet." Skip |
| Product has no images | Include product, omit image references. Note in QA |
| Product missing pricing | Show "N/A" in price fields. Flag in commercial summary |
| No buyer deals / no brand associations | Tell user, ask if they want to select brands manually from catalog |

### Tool Availability

| Scenario | Behaviour |
|----------|-----------|
| Gamma MCP not configured | Fail early: "Gamma MCP tools not available. Set up the Gamma MCP server." |
| Puppeteer MCP not configured | Generate deck but skip QA: "Puppeteer not available — skipping visual QA. Review manually at {gammaUrl}" |
| Catalog App unreachable | Fail early: "Cannot reach catalog app at {CATALOG_APP_URL}." |
| HubSpot API errors | Defer to `hubspot-api-query` skill's error handling |

## Multi-Brand Handling

- One deck per brand, generated sequentially
- QA runs independently on each deck
- All deck URLs presented at the end as a summary

## Final Output

For each generated deck:
- Gamma URL (editable in Gamma's editor)
- QA status: passed / passed with notes / issues remaining
- Screenshots of the final deck
- Reminder that decks can be exported as PDF/PPTX from Gamma
