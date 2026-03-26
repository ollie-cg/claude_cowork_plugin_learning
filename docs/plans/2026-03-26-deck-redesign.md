# Deck Redesign: Plugin Brands Retailer Sales Deck

## Context

The current deck template (`deck-template.ts`) is a generic product catalog — brand-centric styling (MOJU orange), no Plugin Brands identity, no narrative structure. It needs to become a **Plugin Brands sales deck** pitched at **retailers/buyers**.

## Audience

Retailers and buyers (e.g., Tesco, Waitrose). Plugin Brands is pitching a brand's products to a buyer on behalf of the brand.

## Narrative Arc

**Dark (PB) → Light (Brand) → Dark (PB)**

Plugin Brands introduces themselves, showcases the brand and products, then closes the deal as the partner.

## Visual Style

- **PB intro slides (1-3) and closing slide:** Dark background (#1a1a1a), white text, PB logo (white version), bold clean sans-serif typography. Matches pluginbrands.com aesthetic.
- **Brand/product slides (4-9):** Light/white background, clean product photography, subtle grey card backgrounds. Lets the brand's products shine without competing with PB branding.
- **Transition:** The shift from dark to light visually signals "now let us show you something exciting."

## PB Assets

- **White logo (for dark slides):** `https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/7a6b7512-2654-423e-9357-1f8ca924904a/PluginBrands-white.png`
- **Main logo (for light slides):** `https://images.squarespace-cdn.com/content/v1/68ff4a2ef01c946f5db3e663/64630e44-ff1a-47d6-ace1-764f5f520f50/logo.webp`

## Slide Structure

### Slide 1: Title (Dark)
- Full dark background (#1a1a1a)
- PB white logo centered at top
- Large bold text: "Prepared for [Prospect Name]"
- Smaller text: brand name being pitched
- Minimal, premium feel

### Slide 2: Who We Are (Dark)
- PB logo top-left
- Headline: "Who We Are"
- Short paragraph positioning PB as a commercial partner for challenger brands
- 3-4 key stats in a row (placeholder values): e.g., "50+ Brands | 3,000+ Retail Doors | UK & International"
- Optional: row of partner brand logos

### Slide 3: What We Can Do Together (Dark)
- Headline: "What We Can Do Together"
- 3-4 value proposition blocks: "Sales & Distribution", "Category Strategy", "Marketing Support", "Brand Building"
- Brief line under each explaining the benefit to the retailer

### Slide 4: Brand Introduction (Light)
- Visual transition to white/light background
- Brand name as large headline
- Brand hero image/logo if available
- "Why [Brand Name]" — 3-4 key differentiators (target consumer, market opportunity, what makes it special)
- Country, website as subtle metadata

### Slide 5: Product Range Overview (Light)
- Headline: "The Range"
- Grid of product cards (hero image, name, RSP)
- Clean cards on light grey backgrounds

### Slides 6-8: Hero Product Deep Dives (Light, up to 3 products)
- Large hero image on left (40%)
- Right side: product name, category, description
- Pricing & pack info: RSP, case size
- Ingredients if available
- Only first 3 products get deep dive slides

### Slide 9: Commercial Summary (Light)
- Full-width table: Product, RSP, Case Size, Case Cost
- Clean, scannable — what buyers actually reference

### Slide 10: Next Steps (Dark — back to PB theme)
- Returns to dark PB branding to bookend the deck
- PB logo
- "Let's Talk" / "Next Steps"
- Contact details / CTA

## Changes to Existing Code

### `deck-template.ts`
- Replace entire template with new slide structure
- Add CSS for dark theme slides (`.slide-dark`) and light theme slides (`.slide-light`)
- Embed PB logo as base64 data URI (fetch at build time or embed statically)
- Add PB credential content (placeholder text, easy to update)
- Limit product deep dives to first 3 products
- Update colour palette: remove #ff6b00, use dark (#1a1a1a) + white + subtle accent
- Update footer from "Presented by PluginBrands" to PB logo

### `gamma-input.ts`
- Update markdown slide structure to match new flow
- Add PB intro slides to the Gamma markdown
- Add "Why [Brand]" slide content

### API routes
- No structural changes needed — same inputs, same outputs
- Template changes are internal to the rendering functions

## What Stays the Same

- DeckOptions interface (brand, products, prospectName, message, imageMap)
- API endpoints and request/response format
- Image handling (base64 data URIs for HTML, tunnel URLs for Gamma)
- Commercial summary table structure
- Test structure (update assertions for new HTML output)
