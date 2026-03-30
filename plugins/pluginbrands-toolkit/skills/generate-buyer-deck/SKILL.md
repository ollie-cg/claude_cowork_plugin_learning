---
name: generate-buyer-deck
description: Use when asked to create a sales deck, buyer deck, pitch deck, or presentation for a retailer or buyer. Triggers on phrases like "generate a deck for Tesco", "create a pitch for Sainsbury's", "make a presentation for this buyer", "build a deck".
---

# Generate Buyer Deck

Generates tailored sales decks for retail buyers by combining HubSpot buyer intelligence, product catalog data, and Gamma presentation generation. Produces a 10-slide deck optimized for retailer pitch meetings with automatic visual QA.

## Prerequisites

Before starting, verify these tools and configurations are available:

**REQUIRED:**
- **`hubspot-api-query` skill MUST be active** — provides buyer intelligence gathering patterns, object IDs, and HubSpot API access
- **`GAMMA_API_KEY` environment variable MUST be set** — this is your Gamma API key. Generate one from Gamma Account Settings → API Keys. If missing, fail immediately: "GAMMA_API_KEY is not set. Get an API key from your Gamma account settings."
- **`CATALOG_APP_URL` environment variable MUST be set** — fail early if undefined. This is the base URL for the product catalog app (production: `https://claudecoworkpluginlearning-production.up.railway.app`, local dev: `http://localhost:4100`).

**OPTIONAL:**
- **Puppeteer MCP tools** — `puppeteer_navigate`, `puppeteer_screenshot`, `puppeteer_evaluate`. If unavailable, skip Step 5 (Visual QA) and proceed without screenshots. Inform the user that QA will be manual.

## Step 1: Buyer Intelligence Gathering

Use HubSpot to understand who you're pitching to. This intelligence shapes the entire deck narrative.

### 1a. Resolve the Buyer

Search HubSpot Companies by the buyer name provided:

```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "name",
      "operator": "CONTAINS_TOKEN",
      "value": "BUYER_NAME"
    }]
  }],
  "properties": ["name", "domain", "country", "city", "industry", "numberofemployees"],
  "limit": 100
}
```

**Handle resolution cases:**
- **Zero matches** — Ask user to provide more context or spell out the full company name
- **One match** — Proceed with that company
- **Multiple matches** — Present list with name, domain, location. Ask user to select.

Store the company ID and domain for subsequent steps.

### 1b. Get Prospect Logo

Attempt to fetch the buyer's logo via Clearbit:

```
https://logo.clearbit.com/{domain}
```

If the domain exists, this URL will return the logo image. Test it (or assume it works — Clearbit handles missing logos gracefully by returning a placeholder). Store this URL for the title slide.

### 1c. Fetch All Associated Data

For the resolved company, retrieve ALL associated HubSpot data. Use patterns from `hubspot-api-query` skill.

**Contacts:**
```
GET /crm/v3/objects/companies/{companyId}/associations/contacts
```

Then fetch full contact details:
```
POST /crm/v3/objects/contacts/batch/read
{
  "properties": ["firstname", "lastname", "email", "jobtitle", "phone"],
  "inputs": [{"id": "contactId1"}, {"id": "contactId2"}, ...]
}
```

**Deals (Buyer Deal Pipeline ONLY — `2760762586`):**
```
GET /crm/v3/objects/companies/{companyId}/associations/deals
```

Then fetch deal details and filter to Buyer Deal Pipeline:
```
POST /crm/v3/objects/deals/batch/read
{
  "properties": ["dealname", "dealstage", "pipeline", "amount", "closedate", "createdate", "hubspot_owner_id"],
  "inputs": [{"id": "dealId1"}, {"id": "dealId2"}, ...]
}
```

Filter results to `pipeline = "2760762586"` only. Discard deals from other pipelines.

**Notes:**
```
GET /crm/v3/objects/companies/{companyId}/associations/notes
```

Fetch note content:
```
POST /crm/v3/objects/notes/batch/read
{
  "properties": ["hs_note_body", "hs_timestamp", "hs_created_by"],
  "inputs": [{"id": "noteId1"}, ...]
}
```

**Calls:**
```
GET /crm/v3/objects/companies/{companyId}/associations/calls
```

Fetch call details:
```
POST /crm/v3/objects/calls/batch/read
{
  "properties": ["hs_call_title", "hs_call_body", "hs_call_duration", "hs_timestamp"],
  "inputs": [{"id": "callId1"}, ...]
}
```

**Meetings:**
```
GET /crm/v3/objects/companies/{companyId}/associations/meetings
```

Fetch meeting details:
```
POST /crm/v3/objects/meetings/batch/read
{
  "properties": ["hs_meeting_title", "hs_meeting_body", "hs_meeting_start_time", "hs_meeting_outcome"],
  "inputs": [{"id": "meetingId1"}, ...]
}
```

**Emails:**
Attempt to fetch, but note that email scope may be blocked by HubSpot API permissions:
```
GET /crm/v3/objects/companies/{companyId}/associations/emails
```

If scope-blocked (403/401), note this in your intelligence summary. If accessible, fetch details:
```
POST /crm/v3/objects/emails/batch/read
{
  "properties": ["hs_email_subject", "hs_email_text", "hs_timestamp"],
  "inputs": [{"id": "emailId1"}, ...]
}
```

### 1d. Synthesise Buyer Profile

Analyze all gathered data and create a buyer profile covering:

**Who they are:**
- Company name, size (employees), industry
- Location (city, country)
- Key contacts (names, titles)

**Deal history:**
- Active deals (stages, amounts, dates)
- Deal outcomes (won/lost)
- Brands pitched (from Brand associations via deals — use patterns from `hubspot-api-query`)
- Historical engagement timeline

**Communication style:**
- Note/call/meeting patterns
- Response frequency
- Preferred channels
- Key topics discussed

**Priorities and motives:**
Based on all the above, propose what this buyer cares about. This is strategic inference — what are they trying to achieve? What pressures do they face? What do they value?

**Example:**
For Tesco:
- **Who:** Major UK grocer, 300k+ employees, Welwyn Garden City HQ
- **Contacts:** Sarah Johnson (Category Manager - Beverages), Tom Wright (Buyer - Health & Wellness)
- **Deal history:** 3 active pitches (MOJU, Love Corn, GLUG!), 2 at Feedback Received stage, 1 at Follow Up. Previous wins with functional beverages.
- **Communication:** Prefers concise email summaries. Monthly catch-up calls. Notes emphasize data-driven decisions and shelf ROI.
- **Motives (PROPOSED):**
  - Drive category growth in functional beverages (wellness trend)
  - Differentiate from discounters with premium/unique products
  - Maximize margin per linear foot (space is premium)
  - Respond to consumer demand for clean label, natural ingredients

Present this profile to the user with **PROPOSED MOTIVES** clearly marked.

### 1e. User Validates Motives

Present the buyer profile and explicitly ask:

"**Review the proposed buyer motives above.** These will shape the entire deck narrative. Do these align with your understanding of this buyer? Please:
- Confirm if accurate
- Edit or refine any points
- Add any additional context about what matters to them"

Wait for user input. Do NOT proceed until motives are validated. The validated motives become the strategic foundation for Steps 3 and 4.

## Step 2: Brand & Product Selection

Identify which brands and products to include in the deck.

### 2a. Fetch Brands from HubSpot

From the deals fetched in 1c (filtered to Buyer Deal Pipeline), get associated Brands:

For each deal:
```
GET /crm/v3/objects/deals/{dealId}/associations/0-970
```

Then fetch Brand details:
```
POST /crm/v3/objects/0-970/batch/read
{
  "properties": ["hs_name", "client_name_sync", "buyer_name", "hs_pipeline_stage"],
  "inputs": [{"id": "brandId1"}, {"id": "brandId2"}, ...]
}
```

Extract unique `client_name_sync` values — these are the client brand names (e.g., "MOJU", "Love Corn").

### 2b. Match Brands to Catalog App

Fetch all brands from the Catalog App:
```
GET {CATALOG_APP_URL}/api/brands
```

Expected response:
```json
[
  {"id": 1, "name": "MOJU", ...},
  {"id": 2, "name": "Love Corn", ...}
]
```

Match HubSpot `client_name_sync` to Catalog App `name` using **case-insensitive comparison**.

**Report unmatched brands clearly:**
If a HubSpot brand has no Catalog App match, state: "Brand '{client_name_sync}' from HubSpot deal '{dealname}' is not found in the Catalog App. This brand cannot be included in the deck."

Proceed only with matched brands.

### 2c. Fetch Products per Brand

For each matched brand, fetch its products from the Catalog App:
```
GET {CATALOG_APP_URL}/api/brands/{brandId}/products
```

Expected response:
```json
[
  {
    "id": 1,
    "name": "MOJU Ginger Shot",
    "rsp": "£2.99",
    "case_size": 12,
    "wholesale_cost": "£1.20",
    "category": "Functional Beverages",
    "description": "Organic cold-pressed ginger shot...",
    "ingredients": "Ginger (60%), Apple, Lemon...",
    "file_path": "images/moju-ginger.jpg"
  },
  ...
]
```

Store all products per brand. Note that product images are accessible at:
```
{CATALOG_APP_URL}/api/images/{file_path}
```

### 2d. User Selects Products

Present products to the user **organized by brand**, with checkboxes for selection.

**Pre-select products from Product Pitch records:**
For each deal, fetch associated Product Pitches:
```
GET /crm/v3/objects/deals/{dealId}/associations/0-420
```

Fetch Product Pitch details:
```
POST /crm/v3/objects/0-420/batch/read
{
  "properties": ["hs_name", "client_name_sync", "hs_pipeline_stage"],
  "inputs": [{"id": "pitchId1"}, ...]
}
```

Parse `hs_name` (format: `PRODUCT / BUYER - CLIENT [ID]`) to extract product name. Match product names to Catalog App products (case-insensitive). Pre-check these products.

**Present selection UI (conceptual — adapt to chat):**

```
Select products for MOJU:
[x] MOJU Ginger Shot
[ ] MOJU Turmeric Shot
[x] MOJU Beetroot Shot
[ ] MOJU Immunity Shot

Select products for Love Corn:
[ ] Love Corn Sea Salt
[ ] Love Corn BBQ
...
```

**Constraint:** Maximum 3 products can be selected for "Deep Dive" slides (Slides 6-8). If user selects >3, ask which 3 should get deep dives. The rest appear on Slide 5 (The Range) only.

### 2e. Confirm Brands to Generate

If multiple brands are selected, ask the user:

"You have selected products from {N} brands: {brand1}, {brand2}, ...

I will generate **one deck per brand** (each deck is tailored to that brand's story). Which brands should I generate decks for?"

User can choose all, or a subset. **One deck per brand** is generated.

## Step 3: Deck Narrative & Flow

For each brand to generate, propose a narrative structure.

### 3a. Propose Narrative

Based on:
- Validated buyer motives (from Step 1e)
- Selected brand and products (from Step 2)
- Buyer intelligence (deal history, communication style)

Propose the following narrative elements for each brand:

**Title slide message:**
What's the one-sentence hook? What outcome does this partnership deliver?

**Brand introduction angle (Slide 4):**
Why is this brand relevant to this buyer? What problem does it solve for them? How does it align with their priorities?

**Deep dive emphasis per product (Slides 6-8):**
For each of the (up to 3) deep dive products, what should we emphasize?
- Unique selling points?
- Category growth data?
- Ingredient story?
- Margin opportunity?
- Consumer trends?

**Commercial angle (Slide 9):**
How do we frame the commercial summary? Margin focus? Volume play? Trial + scale narrative?

**Example narrative (MOJU → Tesco):**

```
Brand: MOJU
Buyer: Tesco

Title message: "Unlock the £42M Functional Shots Category with the UK's #1 Brand"

Brand introduction angle:
Tesco is driving wellness category growth to differentiate from discounters. MOJU is the market leader in functional shots (32% category share), with strong repeat purchase rates and premium positioning. Aligns with clean label, natural ingredients demand.

Deep dive emphasis:
- MOJU Ginger Shot: Hero product, highest velocity, strong margin (48% GP), clean ingredient deck
- MOJU Beetroot Shot: Sports nutrition crossover, taps into fitness trend, unique flavor profile
- MOJU Immunity Shot: Seasonal driver (Q4 spike), vitamin-rich, addresses wellness priorities

Commercial angle:
Frame as margin-accretive range extension. Highlight per-unit GP vs. category average. Propose planogram placement near breakfast/smoothies for impulse purchase.
```

Present this narrative proposal to the user for each brand.

### 3b. User Validates Narrative

Ask the user to review and validate:

"**Review the proposed narrative for {Brand} → {Buyer}.** This will shape the deck content. You can:
- Approve as-is
- Change the messaging or emphasis
- Reorder products for deep dives
- Add specific talking points or data callouts"

Wait for user confirmation. Iterate if needed. Once validated, proceed to deck generation.

## Step 4: Build Markdown & Generate via Gamma

### 4a. Build Markdown Input

Construct markdown for the deck using the exact template below. All 10 slides, separated by `---`.

**Slide 1: Title Slide**

If prospect logo is available (from Step 1b):
```markdown
# {Brand Name} × {Buyer Name}
## {Title message from narrative}

| | |
|---|---|
| ![PB Logo]({PB_LOGO_URL}) | ![Buyer Logo](https://logo.clearbit.com/{domain}) |
```

If prospect logo is NOT available (domain missing or Clearbit fails):
```markdown
# {Brand Name} × {Buyer Name}
## {Title message from narrative}

![PB Logo]({PB_LOGO_URL})
```

**Slide 2: Who We Are (Fixed Content)**

```markdown
# Who We Are

**Plugin Brands** is an outsourced commercial team for consumer brands.

We partner with innovative food and drink brands to unlock retail distribution across the UK and Europe.

**Our approach:**
- Dedicated category experts
- Data-driven pitch strategies
- Long-term buyer relationships
- End-to-end sales support

We don't just open doors — we drive sustainable growth.
```

**Slide 3: What We Can Do Together (Fixed Content)**

```markdown
# What We Can Do Together

## Four pillars of partnership:

**1. Category Insight**
Market data, consumer trends, and competitive intelligence to position your range for maximum impact.

**2. Tailored Pitching**
We know your buyers. Every pitch is crafted to align with their priorities and trading strategies.

**3. Operational Excellence**
From samples to purchase orders, we manage the process so you can focus on product.

**4. Ongoing Support**
Launch isn't the finish line. We monitor performance, optimize listings, and identify expansion opportunities.
```

**Slide 4: Brand Introduction (Tailored)**

Use the brand introduction angle from the validated narrative. Structure:

```markdown
# Introducing {Brand Name}

{Brand introduction narrative — 2-3 paragraphs covering:
- What the brand is (category, positioning)
- Why it's relevant to this buyer (alignment with their priorities)
- Key proof points (market share, growth, awards, consumer love)
}

{If available from Catalog App brand data, add brand logo or hero image}
```

**Slide 5: The Range**

List ALL selected products with name, RSP, and hero image:

```markdown
# The Range

{For each selected product:}

**{Product Name}**
{Product Description (1 sentence)}
RSP: {rsp}

![{Product Name}]({CATALOG_APP_URL}/api/images/{file_path})

---

{Repeat for all selected products, separated by horizontal rules within the slide}
```

Format as a visual grid if Gamma supports it (use table or columns), otherwise list vertically.

**Slides 6-8: Deep Dives (Up to 3 Products)**

For each deep dive product (max 3):

```markdown
# {Product Name}

![{Product Name}]({CATALOG_APP_URL}/api/images/{file_path})

**Category:** {category}

{Product description — expanded based on deep dive emphasis from narrative}

**RSP:** {rsp}
**Case Size:** {case_size} units
**Wholesale Cost:** {wholesale_cost}

**Ingredients:** {ingredients}

{Add 1-2 tailored emphasis points from narrative, e.g.:
- "Leading the functional shots category with 32% share"
- "48% gross profit margin — above category average"
- "Clean label: no added sugar, organic certified"
}
```

**Slide 9: Commercial Summary**

Table of ALL selected products:

```markdown
# Commercial Summary

| Product | RSP | Case Size | Wholesale Cost | Margin |
|---------|-----|-----------|----------------|--------|
{For each selected product:}
| {Product Name} | {rsp} | {case_size} | {wholesale_cost} | {Calculate: ((rsp - wholesale_cost) / rsp * 100).toFixed(0)}% |

**Total SKUs:** {count}
**Recommended Order:** {Suggest a starter order, e.g., "1 case per SKU for trial, {total_cases} cases total"}
```

**Slide 10: Next Steps**

```markdown
# Next Steps

![PB Logo]({PB_LOGO_URL})

**Let's make this happen.**

1. **Review range** — Any questions on products, pricing, or positioning?
2. **Sample delivery** — We'll send a tasting pack within 48 hours
3. **Finalize order** — Confirm quantities and delivery timeline
4. **Launch support** — POS, trade marketing, and ongoing account management

**Contact:**
{Primary PluginBrands contact from deal owner or default contact}

**Ready when you are.**
```

**Assemble the full markdown:**

Concatenate all slides, separated by `---` (three hyphens on a new line). This is the `inputText` parameter for the Gamma API.

### 4b. Call Gamma API

Call the Gamma API directly using curl. The API base URL is `https://public-api.gamma.app/v1.0`.

**Step 1: Create the generation**

```bash
curl -s -X POST "https://public-api.gamma.app/v1.0/generations" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $GAMMA_API_KEY" \
  -d '{
    "inputText": "{Full markdown from 4a}",
    "format": "presentation",
    "textMode": "preserve",
    "numCards": {7 + min(deep_dive_count, 3)},
    "themeId": "chimney-dust",
    "imageOptions": {
      "source": "noImages"
    },
    "cardOptions": {
      "dimensions": "16x9",
      "headerFooter": {
        "bottomRight": {
          "type": "image",
          "source": "custom",
          "src": "https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png",
          "size": "sm"
        },
        "hideFromFirstCard": true,
        "hideFromLastCard": true
      }
    }
  }'
```

This returns a JSON response with a `generationId`:
```json
{ "generationId": "abc123", "warnings": null }
```

**Step 2: Poll for completion**

The generation is asynchronous. Poll every 5 seconds until status is `completed` or `failed`:

```bash
curl -s "https://public-api.gamma.app/v1.0/generations/{generationId}" \
  -H "X-API-KEY: $GAMMA_API_KEY"
```

Response when complete:
```json
{
  "generationId": "abc123",
  "status": "completed",
  "gammaUrl": "https://gamma.app/docs/...",
  "gammaId": "...",
  "exportUrl": null
}
```

Poll up to 60 times (5 minutes). If status is still `pending` after that, report a timeout.

If status is `failed`, report the error from `error.message`.

**Step 3: Return the `gammaUrl` to the user**

The `gammaUrl` is the editable deck link on gamma.app.

**Parameter explanations:**

- **`inputText`**: The full markdown from Step 4a with slides separated by `---`
- **`numCards`**: Always `7 + min(deep_dive_count, 3)`. This accounts for:
  - Slide 1: Title
  - Slide 2: Who We Are
  - Slide 3: What We Can Do Together
  - Slide 4: Brand Introduction
  - Slide 5: The Range
  - Slides 6-8: Deep Dives (1-3 products)
  - Slide 9: Commercial Summary
  - Slide 10: Next Steps

  So if 3 products selected for deep dives: 7 + 3 = 10 cards. If 1 product: 7 + 1 = 8 cards.

- **`themeId`**: ALWAYS `"chimney-dust"` (see Iron Laws)
- **`imageOptions.source`**: ALWAYS `"noImages"` (see Iron Laws) — we provide all images via markdown URLs
- **`textMode`**: ALWAYS `"preserve"` — never let Gamma rewrite our content
- **`cardOptions.headerFooter`**: PB logo on every slide except first and last (title and next steps have logos embedded in content)

**PB Logo URL (use this exact URL):**
```
https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png
```

**Do NOT include `exportAs` parameter** unless user explicitly requests PDF or PPTX export. If they do, add `"exportAs": "pdf"` or `"exportAs": "pptx"` to the request body. The `exportUrl` will be returned in the poll response.

**Maximum `numCards`:** Gamma enforces a limit of 60 cards. If the calculation exceeds this (e.g., if user selects many products), cap at 60 and warn the user.

### 4c. Iron Laws — NEVER VIOLATE THESE

| # | Law | Why |
|---|-----|-----|
| 1 | **Never use Gamma's text generation or condensing modes** | We provide tailored narratives. `textMode: "preserve"` is mandatory. Never use `"generate"` or `"condense"`. |
| 2 | **Always use `imageOptions.source: "noImages"`** | Gamma's AI image selection is unreliable. We provide exact image URLs via markdown. Never use `"auto"` or `"generate"`. |
| 3 | **Always use `themeId: "chimney-dust"`** | Matches PB brand guidelines (dark, premium, clean). Never use other themes unless user explicitly overrides. |
| 4 | **`numCards` max is 60** | Gamma API limit. If calculation exceeds 60, cap it and inform user. Never attempt to generate >60 cards. |
| 5 | **Always use the PB logo URL exactly as specified** | This URL is tested and works. Never substitute or attempt to fetch from elsewhere. Never use `{CATALOG_APP_URL}` for PB logo. |

### 4d. Multi-Brand Handling

If generating decks for multiple brands (from Step 2e), generate **one deck at a time, sequentially**.

For each brand:
1. Build markdown (4a)
2. Call Gamma (4b)
3. Store the returned `gammaUrl`
4. Proceed to next brand

**Do NOT parallelize Gamma calls.** Each deck generation takes time and credits. Sequential processing allows user to review each deck before proceeding.

After all decks are generated, present a summary table (see Step 5g).

## Step 5: Visual QA & Auto-Retry

If Puppeteer MCP tools are available, perform automated visual QA. If not, skip this step and proceed to final output.

### 5a. Open Deck

Use `puppeteer_navigate` to open the Gamma deck URL returned from Step 4b:

```
mcp__puppeteer__puppeteer_navigate({ url: gammaUrl })
```

Wait for page load (Puppeteer handles this automatically).

### 5b. Overview Screenshot

Capture a full-page screenshot at 1280x900:

```
mcp__puppeteer__puppeteer_screenshot({
  name: "deck-overview-{brand}-{buyer}",
  width: 1280,
  height: 900
})
```

This gives a birds-eye view of the deck structure.

### 5c. Inspect DOM

Use `puppeteer_evaluate` to run JavaScript inspection:

```javascript
mcp__puppeteer__puppeteer_evaluate({
  script: `
    (() => {
      const results = {
        cardCount: 0,
        brokenImages: [],
        textTruncation: [],
        overlappingElements: []
      };

      // Count cards (Gamma uses class "gamma-card" or similar — adjust selector if needed)
      const cards = document.querySelectorAll('[class*="card"]');
      results.cardCount = cards.length;

      // Check for broken images
      const images = document.querySelectorAll('img');
      images.forEach((img, i) => {
        if (img.naturalWidth === 0 && img.complete) {
          results.brokenImages.push({
            index: i,
            src: img.src,
            alt: img.alt
          });
        }
      });

      // Check for text truncation (scrollWidth > clientWidth indicates overflow)
      const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, td, li');
      textElements.forEach((el, i) => {
        if (el.scrollWidth > el.clientWidth + 5) { // 5px tolerance
          results.textTruncation.push({
            index: i,
            text: el.textContent.substring(0, 50),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
          });
        }
      });

      // Check for overlapping elements (bounding box collision detection)
      const allElements = document.querySelectorAll('div, p, h1, h2, h3, img, table');
      const rects = Array.from(allElements).map(el => el.getBoundingClientRect());
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const r1 = rects[i];
          const r2 = rects[j];
          const overlap = !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
          if (overlap && r1.width > 10 && r1.height > 10 && r2.width > 10 && r2.height > 10) {
            // Only flag significant overlaps (not decorative elements)
            results.overlappingElements.push({ element1: i, element2: j });
          }
        }
      }

      return results;
    })();
  `
})
```

Store the results for analysis in Step 5e.

### 5d. Screenshot Individual Slides

For each card, scroll to it and capture a screenshot:

```javascript
// First, get card elements
mcp__puppeteer__puppeteer_evaluate({
  script: `
    const cards = document.querySelectorAll('[class*="card"]');
    return cards.length;
  `
})

// Then for each card index:
for (let i = 0; i < cardCount; i++) {
  mcp__puppeteer__puppeteer_evaluate({
    script: `
      const cards = document.querySelectorAll('[class*="card"]');
      cards[${i}].scrollIntoView({ behavior: 'smooth', block: 'center' });
    `
  })

  // Wait a moment for scroll
  // (Puppeteer may need a delay — implement via setTimeout or similar if supported)

  mcp__puppeteer__puppeteer_screenshot({
    name: `slide-${i + 1}-{brand}-{buyer}`,
    width: 1280,
    height: 720
  })
}
```

### 5e. QA Checklist

Analyze the DOM inspection results (from 5c) and screenshots (from 5d) against this checklist:

| # | Check | Pass Criteria | Issue Type |
|---|-------|---------------|------------|
| Q1 | Slide count matches expected | `cardCount === numCards` from 4b | Critical |
| Q2 | No text truncation | `textTruncation.length === 0` | Major |
| Q3 | All images visible | `brokenImages.length === 0` | Critical |
| Q4 | Tables readable | Manual review of Slide 9 screenshot — columns not squashed, text legible | Major |
| Q5 | No text overlap | `overlappingElements.length === 0` (or only minor decorative overlaps) | Major |
| Q6 | PB logo present | Visible in footer on slides 2-9 (check screenshots) | Minor |
| Q7 | Whitespace balance | Manual review — slides not overcrowded, good spacing | Minor |
| Q8 | Brand consistency | Theme is chimney-dust, colors match (dark backgrounds, white text) | Minor |

**Scoring:**
- **Passed**: All checks pass, or only Minor issues
- **Passed with notes**: 1-2 Major issues, no Critical issues
- **Issues remaining**: Any Critical issue, or 3+ Major issues

### 5f. Auto-Retry Logic

If QA reveals issues, attempt to fix and regenerate **up to 2 times** (3 total generations including the first).

**Adjustment strategies per issue type:**

| Issue | Strategy |
|-------|----------|
| **Slide count mismatch** | Recount products selected for deep dives. Recalculate `numCards = 7 + min(deepDiveCount, 3)`. Verify markdown has correct number of `---` separators. Regenerate. |
| **Text truncation** | Shorten narrative content on affected slides. Remove adjectives, tighten sentences. Ensure product descriptions <100 words. Regenerate. |
| **Broken images** | Verify image URLs are correct: `{CATALOG_APP_URL}/api/images/{file_path}`. Test URLs directly. If Catalog App is unreachable, flag to user and skip images. Regenerate with working URLs only. |
| **Table readability** | Reduce columns in Commercial Summary (Slide 9). Remove "Margin" column if squashed. Use shortened product names. Regenerate. |
| **Text overlap** | Reduce content density. Split dense slides into two. Remove redundant text. Regenerate. |
| **Missing PB logo** | Verify `cardOptions.headerFooter` config in 4b. Check PB logo URL is correct. Regenerate. |

**Inform user about retries:**
"QA detected {issue count} issues. Adjusting content and regenerating deck (attempt {n}/3). Note: Each generation consumes Gamma credits."

**After max retries (3 total):**
If issues remain, present the **best version** (fewest issues) and list remaining issues:

"Deck generated with {n} attempts. Remaining issues:
- {Issue 1}
- {Issue 2}

You can manually edit the deck in Gamma to resolve these, or I can attempt further regeneration with different adjustments."

### 5g. Final Output

Present the final output to the user:

**Single-brand output:**

```
# Buyer Deck Generated: {Brand} → {Buyer}

**Gamma URL:** {gammaUrl}

**QA Status:** {Passed / Passed with notes / Issues remaining}

{If issues remaining, list them}

**Screenshots:**
{Display or link to screenshots from 5b and 5d}

**Next Steps:**
1. Review the deck in Gamma (click URL above)
2. Edit any slides directly in Gamma if needed
3. Export as PDF or PPTX via Gamma's export menu (top-right)
4. Send to buyer or use in pitch meeting

**Reminder:** The deck is editable in Gamma. You can adjust text, reorder slides, or change images directly in the Gamma editor.
```

**Multi-brand output:**

Present a summary table:

```
# Buyer Decks Generated: {N} decks for {Buyer}

| Brand | Products | Slides | Gamma URL | QA Status |
|-------|----------|--------|-----------|-----------|
| {Brand 1} | {count} | {numCards} | [Open Deck]({gammaUrl1}) | {status} |
| {Brand 2} | {count} | {numCards} | [Open Deck]({gammaUrl2}) | {status} |
| ... | ... | ... | ... | ... |

**Screenshots:** {Links to all deck screenshots}

**Next Steps:** Review each deck, edit as needed in Gamma, then export for pitch meetings.
```

## Error Handling

### Missing Data

Handle these scenarios gracefully:

| Scenario | Action |
|----------|--------|
| **Buyer not found in HubSpot** | Ask user to confirm spelling or provide company domain. Offer to search again with broader criteria. |
| **Brand not in Catalog App** | List unmatched brands clearly. Ask user if they want to proceed with matched brands only, or if Catalog App data needs updating. |
| **Zero products in Catalog App for brand** | Cannot generate deck for this brand. Inform user: "Brand '{name}' has no products in the Catalog App. Please add products before generating a deck." |
| **No product images** | Generate deck with text-only product descriptions. Warn user: "Products missing images: {list}. Deck will have text-only product slides." |
| **Missing pricing data (RSP, wholesale cost, case size)** | Omit Commercial Summary table (Slide 9). Inform user: "Pricing data incomplete. Slide 9 (Commercial Summary) will be omitted." Adjust `numCards` accordingly. |
| **No deals found for buyer** | Proceed without deal intelligence. Inform user: "No deals found in HubSpot for this buyer. Narrative will be generic (no deal-specific context)." Ask user to provide buyer priorities manually. |
| **No brand associations on deals** | Cannot auto-suggest brands. Ask user: "No brands associated with deals for this buyer. Which client brands should I include in the deck?" User selects manually from Catalog App brands. |

### Tool Availability

| Scenario | Action |
|----------|--------|
| **`GAMMA_API_KEY` not set** | FAIL immediately: "GAMMA_API_KEY is not set. Get an API key from your Gamma Account Settings → API Keys." |
| **Gamma API returns 401** | API key is invalid or expired: "Gamma API authentication failed. Check your GAMMA_API_KEY is correct and not expired." |
| **Gamma API returns 429** | Rate limited: wait 10 seconds and retry once. If still 429, inform user to try again later. |
| **Gamma generation times out** | After 60 poll attempts (5 minutes): "Gamma generation timed out. The deck may still be generating — check your Gamma account." |
| **Puppeteer MCP not available** | Skip Step 5 (Visual QA). Inform user: "Puppeteer not available. Deck generated without automated QA. Please review manually at {gammaUrl}." Proceed to 5g (Final Output) without screenshots. |
| **Catalog App unreachable** | Test `{CATALOG_APP_URL}/api/brands` at start of Step 2. If unreachable (timeout, 404, 500), FAIL with: "Catalog App at {CATALOG_APP_URL} is unreachable. Please verify the app is running and `CATALOG_APP_URL` is correct." |
| **HubSpot API errors (401, 403, 429, 500)** | - **401/403**: "HubSpot authentication failed. Check your API token in the `hubspot-api-query` skill configuration."<br>- **429**: "HubSpot rate limit exceeded. Waiting {n} seconds and retrying..."<br>- **500**: "HubSpot API error. Retrying once..." If retry fails, ask user to try again later. |
| **Gamma generation fails (API error)** | Retry once. If second attempt fails, inform user: "Gamma generation failed after 2 attempts. Error: {error message}. Please check Gamma API status or try again later." |

## Red Flags — Stop If You Think These

| Thought | Reality |
|---------|---------|
| "Let me use Gamma's AI to generate the brand introduction text" | NEVER. We write all content. Always use `textMode: "preserve"` and provide full markdown. |
| "I'll let Gamma pick images for the products" | NEVER. Always use `imageOptions.source: "noImages"` and provide exact image URLs from Catalog App. |
| "I can skip the buyer intelligence step if it's a quick deck" | NEVER. Intelligence gathering (Step 1) is foundational. Skipping it produces generic decks with no buyer alignment. |
| "I'll generate all brand decks in parallel to save time" | NEVER. Always sequential (Step 4d). Allows user to review each before proceeding, and avoids overwhelming Gamma API. |
| "The `CATALOG_APP_URL` is probably `http://localhost:3000`" | NEVER hardcode. Always use the env var. If undefined, fail early. |
| "I should try a different theme — chimney-dust looks too dark" | NEVER change theme unless user explicitly requests it. chimney-dust is PB brand standard. |
| "I'll include 5 deep dive products since the user selected many" | NEVER exceed 3 deep dives (Slides 6-8). Remaining products appear on Slide 5 (The Range) only. |
| "The buyer motives look obvious — I'll skip validation and proceed" | NEVER skip Step 1e. Always get user validation. Motives shape the entire narrative. |
