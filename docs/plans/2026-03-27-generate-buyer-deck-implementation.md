# Generate Buyer Deck — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the `generate-buyer-deck` skill in the `pluginbrands-toolkit` plugin — a SKILL.md that teaches Claude to orchestrate HubSpot buyer intelligence, Catalog App product data, and Gamma MCP to produce tailored sales decks with Puppeteer visual QA and auto-retry.

**Architecture:** Single SKILL.md file following existing plugin conventions. The skill is pure instructional markdown — no code. It references the `hubspot-api-query` skill for CRM patterns, the Gamma MCP `generate` tool for deck creation, and Puppeteer MCP tools for visual QA. Plugin README and settings updated to register the new skill.

**Tech Stack:** Markdown (SKILL.md), Gamma MCP (`generate`, `get_themes`), Puppeteer MCP (`puppeteer_navigate`, `puppeteer_screenshot`, `puppeteer_evaluate`), HubSpot API (via `hubspot-api-query` skill), Catalog App REST API.

---

### Task 1: Create the SKILL.md file with frontmatter and overview

**Files:**
- Create: `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`

**Step 1: Create the skill directory and file**

Create `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md` with:

```markdown
---
name: generate-buyer-deck
description: Use when asked to create a sales deck, buyer deck, pitch deck, or presentation for a retailer or buyer. Triggers on phrases like "generate a deck for Tesco", "create a pitch for Sainsbury's", "make a presentation for this buyer", "build a deck".
---

# Generate Buyer Deck

Create a tailored PluginBrands sales deck for a retail buyer. Orchestrates HubSpot (buyer intelligence), the Catalog App (product data and images), and Gamma (presentation generation) with automated visual QA.

**Prerequisites:**
- The `hubspot-api-query` skill MUST be active. It provides object type IDs, pipeline stage mappings, and API patterns used throughout this workflow.
- The Gamma MCP server MUST be configured (provides the `generate` tool). If unavailable, fail early: "Gamma MCP tools not available. Set up the Gamma MCP server to use this skill."
- The `CATALOG_APP_URL` environment variable MUST be set, pointing to the shared hosted catalog app. If unset, fail early: "CATALOG_APP_URL is not configured."
- Puppeteer MCP tools are optional. If unavailable, skip visual QA and tell the user: "Puppeteer not available — skipping visual QA. Review the deck manually."
```

**Step 2: Verify the file exists**

Run: `ls -la plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`
Expected: File exists with the content above.

**Step 3: Commit**

```bash
git add plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md
git commit -m "feat: scaffold generate-buyer-deck skill with frontmatter and overview"
```

---

### Task 2: Add Step 1 — Buyer Intelligence Gathering

**Files:**
- Modify: `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`

**Step 1: Append Step 1 content to SKILL.md**

Append the following after the prerequisites section:

```markdown

## Step 1: Buyer Intelligence Gathering

Gather comprehensive data about the buyer before building any slides. This intelligence drives the entire deck narrative.

### 1a. Resolve the buyer

The user will name a buyer (e.g. "Tesco", "Sainsbury's"). Search HubSpot Companies:

```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [{"filters": [{"propertyName": "name", "operator": "CONTAINS_TOKEN", "value": "BUYER_NAME"}]}],
  "properties": ["name", "domain", "city", "country", "industry", "description", "numberofemployees"],
  "limit": 10
}
```

If multiple matches, present the list and ask the user to pick. If zero matches, ask for the correct name or HubSpot Company ID.

### 1b. Get the prospect logo

Use the company domain to construct a logo URL:

```
https://logo.clearbit.com/{domain}
```

This is used on the title slide alongside the PB logo. If no domain exists on the Company record, skip the prospect logo.

### 1c. Fetch all associated data

Pull everything about this buyer from HubSpot. Use the `hubspot-api-query` patterns for all calls.

**Contacts:**
```
GET /crm/v3/objects/companies/{companyId}/associations/contacts
```
Then for each contact:
```
GET /crm/v3/objects/contacts/{contactId}?properties=firstname,lastname,email,jobtitle,phone
```

**Deals:**
```
GET /crm/v3/objects/companies/{companyId}/associations/deals
```
Then for each deal:
```
GET /crm/v3/objects/deals/{dealId}?properties=dealname,amount,dealstage,pipeline,closedate,hubspot_owner_id
```

Only include deals in the Buyer Deal Pipeline (`2760762586`).

**Notes:**
```
GET /crm/v3/objects/companies/{companyId}/associations/notes
```
Then for each note:
```
GET /crm/v3/objects/notes/{noteId}?properties=hs_note_body,hs_createdate
```

**Calls:**
```
GET /crm/v3/objects/companies/{companyId}/associations/calls
```
Then for each call:
```
GET /crm/v3/objects/calls/{callId}?properties=hs_call_body,hs_call_title,hs_timestamp,hs_call_direction
```

**Meetings:**
```
GET /crm/v3/objects/companies/{companyId}/associations/meetings
```
Then for each meeting:
```
GET /crm/v3/objects/meetings/{meetingId}?properties=hs_meeting_title,hs_meeting_body,hs_meeting_start_time
```

**Emails:**
```
GET /crm/v3/objects/companies/{companyId}/associations/emails
```
Then for each email:
```
GET /crm/v3/objects/emails/{emailId}?properties=hs_email_subject,hs_email_text,hs_email_direction,hs_timestamp
```

Note: Email scope may be blocked by the API token. If you get a 403 or empty results, skip emails and note this to the user.

### 1d. Synthesise buyer profile

From all the data gathered, produce a structured buyer profile:

1. **Who they are** — company size, location, industry, what they sell
2. **Deal history** — what brands/products have been pitched before, outcomes
3. **Communication style** — tone of emails/notes, frequency of contact, who the key contacts are
4. **Priorities and motives** — what do they seem to care about? Price? Innovation? Health credentials? Sustainability? Rate of sale?

Present this as a summary and **propose buyer motives** — e.g.:
> "Tesco appears focused on health-conscious ranges. Certifications have been mentioned twice in notes. Pricing sensitivity came up in the last call with Jane Smith. They seem to favour brands with strong in-store activation support."

### 1e. User validates motives

Ask the user to review the proposed buyer motives. They can:
- Agree as-is
- Edit or add motives
- Provide additional context not in HubSpot

The validated motives become the strategic foundation for the deck.
```

**Step 2: Verify the addition**

Run: `grep -c "Step 1" plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`
Expected: At least 1 match.

**Step 3: Commit**

```bash
git add plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md
git commit -m "feat: add buyer intelligence gathering step to generate-buyer-deck skill"
```

---

### Task 3: Add Step 2 — Brand & Product Selection

**Files:**
- Modify: `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`

**Step 1: Append Step 2 content**

Append after Step 1:

```markdown

## Step 2: Brand & Product Selection

### 2a. Fetch brands from HubSpot

Get all Buyer Deals for this Company (already fetched in Step 1c). For each deal, follow associations to Brand records:

```
GET /crm/v3/objects/deals/{dealId}/associations/0-970
```

For each Brand:
```
GET /crm/v3/objects/0-970/{brandId}?properties=hs_name,client_name_sync,buyer_name,hs_pipeline_stage,hs_status,hs_description
```

Collect the `client_name_sync` values — these are the brand names to match against the Catalog App.

### 2b. Match brands to the Catalog App

For each brand `client_name_sync`, query the catalog:

```
GET {CATALOG_APP_URL}/api/brands
```

Match by name (case-insensitive). If a brand exists in HubSpot but not in the catalog, report clearly:
> "MOJU exists in HubSpot but has no catalog data. Skipping."

If no brands match, ask the user if they want to select brands manually from the catalog.

### 2c. Fetch products per brand

For each matched brand, fetch all products:

```
GET {CATALOG_APP_URL}/api/brands/{brandId}/products
```

This returns products with their images, pricing, descriptions, and other attributes.

### 2d. User selects products

Present products to the user per brand. Pre-select products that are associated with the buyer's deal (via Product Pitch records `0-420`).

Format:
> **MOJU** — 6 products available:
> - [x] Ginger Shot (£2.49 RSP)
> - [x] Turmeric Shot (£2.49 RSP)
> - [ ] Vitality Pack (£7.99 RSP)
> - [x] Dosing Bottle (£5.99 RSP)
> - [ ] B12 Shot (£2.49 RSP)
> - [ ] Gift Box (£14.99 RSP)
>
> [x] = pre-selected from deal. Confirm or adjust?

The user confirms or adjusts per brand. If they select more than 3 products, note that only 3 will get deep-dive slides; the rest appear in The Range and Commercial Summary only.

### 2e. Confirm brands to generate

If multiple brands are available, confirm which brands the user wants decks for. One deck is generated per brand.
```

**Step 2: Commit**

```bash
git add plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md
git commit -m "feat: add brand and product selection step to generate-buyer-deck skill"
```

---

### Task 4: Add Step 3 — Deck Narrative & Flow

**Files:**
- Modify: `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`

**Step 1: Append Step 3 content**

Append after Step 2:

```markdown

## Step 3: Deck Narrative & Flow

Combine the buyer motives (Step 1) with the selected brands and products (Step 2) to craft a tailored narrative.

### 3a. Propose the narrative

For each brand deck, propose:

1. **Title slide message** — a one-liner that resonates with the buyer's motives. E.g. if Tesco cares about health credentials: "Introducing MOJU — The UK's #1 Functional Shots Brand"
2. **Brand introduction angle** — how to frame the brand for this buyer. E.g. lead with awards/certifications, or with rate-of-sale data, or with innovation credentials
3. **Deep dive emphasis** — for each product getting a deep dive, which attributes to highlight. E.g. lead with ingredients and certifications for a health-focused buyer, or lead with margin and case economics for a price-focused buyer
4. **Commercial angle** — what to emphasise in the commercial summary. E.g. competitive RSP, strong margin, flexible case sizes

Present this as a narrative plan:
> **Deck narrative for MOJU → Tesco:**
> - **Title:** "Introducing MOJU — The UK's #1 Functional Shots Brand"
> - **Brand angle:** Lead with health credentials and Organic certification. Mention 45% YoY growth in convenience channel.
> - **Deep dive 1 (Ginger Shot):** Lead with ingredients and "nothing artificial" claim. Highlight £2.49 RSP competitive with Pret.
> - **Deep dive 2 (Turmeric Shot):** Lead with trending turmeric/anti-inflammatory angle. Show case economics.
> - **Deep dive 3 (Dosing Bottle):** Position as fridge-door format for repeat purchase. Highlight case size flexibility.
> - **Commercial angle:** Lead with competitive RSP vs. category. Emphasise case size options.

### 3b. User validates narrative

The user reviews and can adjust:
- Change the title message
- Reorder or swap which products get deep dives
- Shift the emphasis (e.g. "actually lead with price, not health")
- Add specific talking points

The validated narrative drives all slide content in Step 4.
```

**Step 2: Commit**

```bash
git add plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md
git commit -m "feat: add deck narrative and flow step to generate-buyer-deck skill"
```

---

### Task 5: Add Step 4 — Build Markdown & Generate via Gamma

**Files:**
- Modify: `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`

**Step 1: Append Step 4 content**

Append after Step 3:

```markdown

## Step 4: Build Markdown & Generate via Gamma

### 4a. Build the markdown input

Construct the markdown slide deck. Each slide is separated by `---`. Use the narrative from Step 3 to tailor content.

**Slide 1 — Title:**
```
# Prepared for {prospect_name}

## {brand_name}

*{title_message_from_step_3}*

| Partner Logos |
|:---:|
| ![PluginBrands](https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png) |
| ![{prospect_name}](https://logo.clearbit.com/{prospect_domain}) |
```

If no prospect domain, omit the prospect logo row and use a single image instead of a table.

**Slide 2 — Who We Are (fixed content):**
```
# Who We Are

We're a commercial partner for the world's most exciting challenger brands. We handle sales, distribution, and brand building — so great products reach the right shelves.

**20+ Brands** | **100+ Buyers** | **UK & International**
```

**Slide 3 — What We Can Do Together (fixed content):**
```
# What We Can Do Together

**Incredible Products** — Introduce you to the most exciting, on-trend brands your customers will love.

**Products Your Team Will Love** — Carefully curated selections that your buying team can get behind with confidence.

**Supply Chain Support** — End-to-end logistics, warehousing, and delivery so you never have to worry about stock.

**Brand Building** — Marketing support, in-store activation, and sampling to drive rate of sale.
```

**Slide 4 — Brand Introduction (tailored):**
```
# {brand_name}

{brand_description_framed_per_narrative}

**Country:** {brand_country}

**Website:** {brand_website}
```

Frame the description using the narrative angle from Step 3. If the brand description from the catalog is generic, rewrite it to emphasise the attributes the buyer cares about.

**Slide 5 — The Range:**
```
# The Range

### {product_1_name} — £{rsp}

{product_1_hero_image_url}

### {product_2_name} — £{rsp}

{product_2_hero_image_url}

...
```

Include ALL selected products. Product image URLs use: `{CATALOG_APP_URL}/api/images/{file_path}`

**Slides 6-8 — Deep Dives (max 3):**

For each deep-dive product (up to 3, chosen in Step 3):
```
# {product_name}

{product_hero_image_url}

**Category:** {category}

{product_description_tailored_to_buyer}

**RSP:** £{rsp}

**Case Size:** {case_size} units

**Wholesale Case Cost:** £{case_cost}

**Ingredients:** {ingredients}
```

Tailor the description and attribute ordering per the narrative. Lead with whatever the buyer cares about most.

**Slide 9 — Commercial Summary:**
```
# Commercial Summary

| Product | RSP | Case Size | Case Cost |
|---------|-----|-----------|-----------|
| {product_1} | £{rsp} | {case_size} units | £{case_cost} |
| {product_2} | £{rsp} | {case_size} units | £{case_cost} |
...
```

Include ALL selected products (not just deep-dive ones).

Use `N/A` for any missing pricing data.

**Slide 10 — Next Steps:**
```
# Next Steps

![PluginBrands](https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png)

Interested in stocking {brand_name}?

We'd love to discuss how these products can fit into your range.

Contact us to arrange a tasting or discuss commercial terms.
```

### 4b. Call the Gamma MCP `generate` tool

Use these exact parameters:

```
generate({
  inputText: <the markdown built above>,
  format: "presentation",
  textMode: "preserve",
  numCards: 7 + min(selected_products_count, 3),
  themeId: "chimney-dust",
  imageOptions: {
    source: "noImages"
  },
  cardOptions: {
    dimensions: "16x9",
    headerFooter: {
      bottomRight: {
        type: "image",
        source: "custom",
        src: "https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png",
        size: "sm"
      },
      hideFromFirstCard: true,
      hideFromLastCard: true
    }
  }
})
```

Do NOT include `exportAs` unless the user explicitly asks for PDF or PPTX.

### 4c. Iron Laws for Gamma generation

1. **NEVER** use `textMode: "generate"` or `"condense"` — our copy is carefully crafted, Gamma must not rewrite it.
2. **ALWAYS** use `source: "noImages"` — we supply product images via URL in the markdown. Do not let Gamma pick stock photos.
3. **ALWAYS** use `chimney-dust` theme unless the user explicitly requests a different one. If they do, use `get_themes` to search for alternatives.
4. `numCards` must not exceed 60 (Gamma hard limit).
5. The PB logo URL is: `https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png`

### 4d. Multi-brand handling

If the user selected multiple brands, generate one deck per brand sequentially. Run Steps 4a-4c for each brand independently. Collect all `gammaUrl` results for the final output.
```

**Step 2: Commit**

```bash
git add plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md
git commit -m "feat: add markdown template and Gamma generation step to generate-buyer-deck skill"
```

---

### Task 6: Add Step 5 — Visual QA with Puppeteer

**Files:**
- Modify: `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`

**Step 1: Append Step 5 content**

Append after Step 4:

```markdown

## Step 5: Visual QA & Auto-Retry

After Gamma returns a `gammaUrl`, open it with Puppeteer and run a structured quality audit. If Puppeteer MCP tools are not available, skip this step entirely and tell the user to review the deck manually.

### 5a. Open the deck

```
puppeteer_navigate({ url: gammaUrl })
```

Wait for the page to fully load. Gamma decks render as scrollable card-based layouts.

### 5b. Take an overview screenshot

```
puppeteer_screenshot({ name: "deck-overview", width: 1280, height: 900 })
```

Review the overall look — does it appear professional and cohesive?

### 5c. Inspect the DOM

Use `puppeteer_evaluate` to extract structural data:

```javascript
// Count slides/cards
const cards = document.querySelectorAll('[class*="card"], [class*="slide"], [data-card-id]');
const cardCount = cards.length;

// Check for images and their load status
const images = document.querySelectorAll('img');
const brokenImages = Array.from(images).filter(img => img.naturalWidth === 0);

// Check for text overflow/truncation
const elements = document.querySelectorAll('h1, h2, h3, p, td, th, li');
const truncated = Array.from(elements).filter(el => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);

// Check for overlapping elements by comparing bounding boxes
const allPositioned = document.querySelectorAll('h1, h2, h3, p, img, table, div[class*="content"]');
const rects = Array.from(allPositioned).map(el => ({ el: el.tagName, rect: el.getBoundingClientRect() }));
```

Note: Gamma's DOM structure may vary. Adapt selectors as needed — look for card containers, content blocks, and media elements.

### 5d. Screenshot individual slides

Scroll through the deck and screenshot each slide for detailed review:

```javascript
// Scroll to each card and screenshot
const cards = document.querySelectorAll('[class*="card"], [data-card-id]');
cards.forEach((card, i) => card.scrollIntoView());
```

Take a screenshot after scrolling to each card:
```
puppeteer_screenshot({ name: "slide-{n}", width: 1280, height: 900 })
```

### 5e. QA Checklist

Evaluate each check and record pass/fail:

| # | Check | Method | Fail Condition |
|---|-------|--------|----------------|
| Q1 | Slide count | DOM query for card elements | Count doesn't match expected `numCards` |
| Q2 | Text truncation | Check `scrollWidth > clientWidth` on text elements | Any product name, price, or description is cut off |
| Q3 | Image visibility | Check `naturalWidth > 0` on all `<img>` elements | Any product image failed to load (broken src) |
| Q4 | Table readability | Inspect Commercial Summary table — column widths, cell wrapping | Columns collapsed or data wrapping badly |
| Q5 | Text overlap | Compare bounding boxes of adjacent elements | Any elements overlapping by more than 5px |
| Q6 | Logo presence | Check for PB logo image on first and last slides | Missing or broken |
| Q7 | Whitespace balance | Screenshot assessment | Any slide is 80%+ empty or content is crammed |
| Q8 | Overall style | Full-page screenshot review | Does not look professional and cohesive |

### 5f. Auto-retry on failure

If ANY check fails, attempt to fix it automatically. Maximum 2 retries (3 total generations including the original). Each retry burns a Gamma credit — inform the user:
> "Found {N} issues. Regenerating — this will use another Gamma credit (retry {n} of 2)."

**Adjustment strategies:**

| Issue | Adjustment to markdown |
|-------|----------------------|
| Q1: Wrong slide count | Check `---` separators are correct. Adjust `numCards` parameter. |
| Q2: Text truncation | Shorten the offending text — trim descriptions, abbreviate product names. |
| Q3: Broken images | Verify catalog app URL is reachable. If a specific image is missing, remove its reference from the slide. |
| Q4: Table too wide | Abbreviate column headers. Shorten product names in the commercial summary table. |
| Q5: Text overlap | Reduce content density on the affected slide — fewer bullet points, shorter paragraphs. |
| Q6: Missing logo | Re-check the PB logo URL is included in the markdown. Add it if missing. |
| Q7: Whitespace imbalance | Redistribute content — move detail between The Range overview and Deep Dives. |
| Q8: Poor style | Add `additionalInstructions` parameter to the `generate` call with layout hints. |

After adjusting the markdown, call `generate` again with the same Gamma configuration (theme, format, etc. stay the same — only `inputText` and possibly `additionalInstructions` change).

Run the full QA checklist again on the regenerated deck.

**After 2 retries:** If issues remain, present the best version to the user with:
- A summary of what couldn't be fixed
- Suggestions for manual edits in Gamma's editor
- The Gamma URL for direct editing

### 5g. Final output

For each generated deck, present:

1. **Gamma URL** — the editable deck link
2. **QA status** — one of:
   - **Passed** — all checks clean
   - **Passed with notes** — minor visual suggestions but nothing broken
   - **Issues remaining** — after 2 retries, some issues couldn't be fixed automatically
3. **Screenshots** — the final overview screenshot and any notable slides
4. **Reminder** — "Decks can be edited directly in Gamma's editor and exported as PDF/PPTX."

If multiple brands were generated, present all deck URLs as a summary table:

| Brand | Gamma URL | QA Status |
|-------|-----------|-----------|
| MOJU | {url} | Passed |
| Love Corn | {url} | Passed with notes |
```

**Step 2: Commit**

```bash
git add plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md
git commit -m "feat: add visual QA and auto-retry step to generate-buyer-deck skill"
```

---

### Task 7: Add Error Handling & Red Flags sections

**Files:**
- Modify: `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`

**Step 1: Append error handling and red flags**

Append after Step 5:

```markdown

## Error Handling

### Missing Data

| Scenario | Behaviour |
|----------|-----------|
| Buyer not found in HubSpot | Tell user, ask for the correct company name or HubSpot Company ID. |
| Brand in HubSpot but not in Catalog App | Report: "{brand} exists in HubSpot but has no catalog data. Skipping." |
| Brand has zero products in catalog | Report: "{brand} is in the catalog but has no products yet." Skip it. |
| Product has no images | Include the product in slides but omit image references. Note it during QA. |
| Product missing pricing data | Show "N/A" in price fields. Flag in the commercial summary. |
| No buyer deals for this company | Tell user no deals are linked. Ask if they want to select brands manually from the catalog. |
| No brand associations on deals | Same as above — ask for manual brand selection. |

### Tool Availability

| Scenario | Behaviour |
|----------|-----------|
| Gamma MCP not configured | Fail early: "Gamma MCP tools not available. Set up the Gamma MCP server to use this skill." |
| Puppeteer MCP not configured | Generate the deck but skip visual QA: "Puppeteer not available — skipping visual QA. Review the deck manually at {gammaUrl}" |
| Catalog App unreachable | Fail early: "Cannot reach the catalog app at {CATALOG_APP_URL}. Check the URL and that the app is running." |
| HubSpot API errors | Defer to `hubspot-api-query` skill's error handling patterns. |
| Gamma generation fails | Report the error from Gamma. Do not retry automatically on Gamma API errors (only retry on visual QA failures). |

## Red Flags — Stop If You Think These

| Thought | Reality |
|---------|---------|
| "I'll use textMode generate to let Gamma write the copy" | NEVER. We craft the copy. Use `preserve` always. |
| "I'll let Gamma pick images with webAllImages" | NEVER. Use `noImages`. We supply our own product images. |
| "I'll skip the buyer intelligence step and just generate" | The intelligence step IS the value. Without it, the deck is generic. |
| "I'll generate all brand decks in parallel" | Generate sequentially. Parallel Gamma calls risk rate limiting and make QA harder. |
| "The catalog app is at localhost" | It's at `CATALOG_APP_URL`. Never hardcode localhost — other team members use the shared hosted instance. |
| "I'll use a different theme that looks nicer" | Stick with `chimney-dust` unless the user explicitly asks for a change. |
| "I'll put all products in deep dives" | Max 3 deep dives. The rest go in The Range and Commercial Summary only. |
| "The user didn't validate motives so I'll proceed" | Always get user sign-off on motives before building the deck. |
```

**Step 2: Commit**

```bash
git add plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md
git commit -m "feat: add error handling and red flags to generate-buyer-deck skill"
```

---

### Task 8: Update plugin README

**Files:**
- Modify: `plugins/pluginbrands-toolkit/README.md`

**Step 1: Add the new skill to the README**

The current README has a skills table with 2 entries. Add the third:

In the skills table, add a new row after `hubspot-hygiene-check`:

```
| generate-buyer-deck | `Skill(pluginbrands-toolkit:generate-buyer-deck)` | Generates tailored Gamma sales decks for retail buyers. Orchestrates HubSpot buyer intelligence, Catalog App product data, and Gamma MCP with automated Puppeteer visual QA. |
```

Add a new usage section after the existing "HubSpot Hygiene Check" section:

```markdown
### Generate Buyer Deck

Run by asking:
- "Generate a deck for Tesco"
- "Create a pitch for Sainsbury's"
- "Build a presentation for this buyer"

Requires:
- `hubspot-api-query` skill (active)
- Gamma MCP server (configured)
- `CATALOG_APP_URL` environment variable (set)
- Puppeteer MCP tools (optional — for visual QA)

Workflow:
1. Gathers buyer intelligence from HubSpot (emails, notes, calls, deals)
2. Proposes buyer motives for user validation
3. Presents brand and product selection from the Catalog App
4. Crafts a tailored narrative for the deck
5. Generates via Gamma MCP with `chimney-dust` theme
6. Runs visual QA with Puppeteer, auto-retries up to 2x if issues found
```

In the Setup section, add the skill permission:

```
"Skill(pluginbrands-toolkit:generate-buyer-deck)"
```

**Step 2: Verify the README**

Run: `grep "generate-buyer-deck" plugins/pluginbrands-toolkit/README.md`
Expected: Multiple matches (table row, usage section, permission).

**Step 3: Commit**

```bash
git add plugins/pluginbrands-toolkit/README.md
git commit -m "docs: add generate-buyer-deck skill to plugin README"
```

---

### Task 9: Update settings.local.json with skill permission

**Files:**
- Modify: `.claude/settings.local.json`

**Step 1: Add the skill permission**

Add the following to the `permissions.allow` array in `.claude/settings.local.json`:

```
"Skill(pluginbrands-toolkit:generate-buyer-deck)"
```

Add it after the existing `Skill(pluginbrands-toolkit:hubspot-hygiene-check)` entry.

**Step 2: Verify**

Run: `grep "generate-buyer-deck" .claude/settings.local.json`
Expected: 1 match.

**Step 3: Commit**

```bash
git add .claude/settings.local.json
git commit -m "config: add generate-buyer-deck skill permission"
```

---

### Task 10: End-to-end verification

**Step 1: Verify skill file structure**

Run: `ls -la plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`
Expected: File exists.

**Step 2: Verify skill frontmatter**

Run: `head -4 plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`
Expected:
```
---
name: generate-buyer-deck
description: Use when asked to create a sales deck, buyer deck, pitch deck, or presentation for a retailer or buyer...
---
```

**Step 3: Verify all sections present**

Run: `grep "^## " plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md`
Expected output should include:
```
## Step 1: Buyer Intelligence Gathering
## Step 2: Brand & Product Selection
## Step 3: Deck Narrative & Flow
## Step 4: Build Markdown & Generate via Gamma
## Step 5: Visual QA & Auto-Retry
## Error Handling
## Red Flags — Stop If You Think These
```

**Step 4: Verify plugin README updated**

Run: `grep -c "generate-buyer-deck" plugins/pluginbrands-toolkit/README.md`
Expected: At least 3 matches.

**Step 5: Verify settings permission**

Run: `grep "generate-buyer-deck" .claude/settings.local.json`
Expected: 1 match.

**Step 6: Verify skill is discoverable**

The skill should be invocable as `Skill(pluginbrands-toolkit:generate-buyer-deck)`. Test by checking the plugin directory structure:

Run: `find plugins/pluginbrands-toolkit/skills -name "SKILL.md" | sort`
Expected:
```
plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md
plugins/pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md
plugins/pluginbrands-toolkit/skills/hubspot-hygiene-check/SKILL.md
```

**Step 7: Final commit if any cleanup needed**

If any adjustments were made during verification, commit them.
