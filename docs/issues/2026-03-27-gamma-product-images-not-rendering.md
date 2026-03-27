# Gamma Deck Generator: Product Images Not Rendering

**Date:** 2026-03-27
**Status:** Open
**Affects:** `generate-buyer-deck` skill, Step 4 (Gamma API call)

## Summary

Product images from the Catalog App are silently dropped by Gamma during deck generation. The PB logo (hosted on Squarespace) renders correctly, but all product images served via ngrok free-tier tunnel are absent from the final deck.

## Root Cause

**ngrok free-tier browser interstitial.** When Gamma's image proxy (`imgproxy.gamma.app`) fetches an image URL from a free ngrok tunnel, ngrok returns an HTML warning page ("Visit Site" button) instead of the actual image binary. Gamma's proxy detects this is not a valid image and silently discards the reference.

### Evidence

1. PB logo (`images.squarespace-cdn.com/...`) renders correctly — no interstitial, direct image response.
2. DOM inspection of generated deck shows 8 `<img>` tags, all pointing to the PB logo on Gamma's CDN. Zero product image references survive.
3. `hasNgrokInHtml: false` — the ngrok URLs are completely absent from the rendered HTML.
4. The ngrok tunnel itself works — `HEAD` requests with `ngrok-skip-browser-warning: true` header return `200 OK` with `Content-Type: image/webp`. But Gamma's proxy doesn't send this custom header.

### How Gamma handles images

- `imageOptions.source: "noImages"` tells Gamma not to ADD its own AI-generated images. It does NOT prevent Gamma from rendering images provided in the markdown input.
- `textMode: "preserve"` preserves text content but Gamma still processes image markdown (`![alt](url)`) through its image proxy pipeline.
- If the proxy can fetch the image, it re-hosts it on `cdn.gamma.app` and renders an `<img>` tag.
- If the proxy cannot fetch a valid image (e.g. gets HTML back from ngrok interstitial), it silently drops the reference.

## Affected Components

| Component | File | Impact |
|-----------|------|--------|
| Deck generation skill | `plugins/pluginbrands-toolkit/skills/generate-buyer-deck/SKILL.md` | Skill assumes `{CATALOG_APP_URL}` images are accessible to Gamma |
| Gamma input builder | `catalog-app/src/lib/gamma-input.ts` | Builds image URLs as `{CATALOG_APP_URL}/api/images/{file_path}` |
| API route | `catalog-app/src/app/api/decks/gamma/route.ts` | Requires `TUNNEL_URL` env var but doesn't validate Gamma can actually reach it |

## Reproduction

1. Start Catalog App on `localhost:4100`
2. Start ngrok free tunnel: `ngrok http 4100`
3. Generate a deck using the `generate-buyer-deck` skill with the ngrok tunnel URL
4. Observe: PB logo appears, product images do not

## Potential Solutions

### Option A: Bypass ngrok interstitial (Quick fix)

Use a paid ngrok plan (Pro/Business). Paid plans serve content directly without the browser warning page. Cost: $10/month.

### Option B: Use Cloudflare Tunnel (Free alternative)

Cloudflare Tunnels (`cloudflared`) provide free HTTPS tunnels without interstitial pages:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:4100
```

Returns a `*.trycloudflare.com` URL that serves images directly.

### Option C: Pre-upload images to a public host

Before calling Gamma, upload product images to a public bucket (S3, Cloudflare R2, etc.) and use those URLs in the markdown. This removes the dependency on tunnels entirely but adds complexity and storage costs.

### Option D: Deploy Catalog App publicly

Deploy the Catalog App to a hosting provider (Vercel, Railway, etc.) so images are served from a stable public URL. This is the long-term solution — eliminates the tunnel requirement entirely.

### Option E: Accept and add manually

Generate the deck without product images and manually drag/drop images into Gamma's editor. Viable for low-volume use but doesn't scale.

## Recommendation

**Short-term:** Option B (Cloudflare Tunnel) — free, no interstitial, drop-in replacement for ngrok.

**Long-term:** Option D (Deploy Catalog App) — stable public URL, no tunnel dependency, works for all consumers of the API.

## Related

- `TUNNEL_URL` environment variable referenced in `catalog-app/src/app/api/decks/gamma/route.ts`
- ngrok interstitial documentation: https://ngrok.com/docs/http/#browser-warnings
- Gamma API image handling: images in markdown are proxied through `imgproxy.gamma.app` during generation
