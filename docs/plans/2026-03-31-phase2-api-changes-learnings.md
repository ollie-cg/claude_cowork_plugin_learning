# Phase 2 API Changes — Learnings

**Date:** 2026-03-31
**Plan:** docs/plans/2026-03-30-catalog-app-design.md (Phase 2)
**Commits:** f4d07b3..5106bb7

## What was delivered

Five commits implementing four tasks:

1. **Brand image endpoints** (f4d07b3) — GET/POST/DELETE for `/api/brands/[id]/images`, with 9 tests
2. **Logo URL on brand listing** (358e43b) — `getAllBrands` LEFT JOINs brand_images to return `logo_url`
3. **API key authentication** (49bbc08) — `withAuth()` wrapper applied to 16 handlers across 9 route files; timing-safe comparison
4. **Gamma removal** (6fd02fa) — Deleted 11 files (1,333 lines), cleaned up README and .gitignore
5. **Review fixes** (5106bb7) — Transformed `logo_url` to full URL, comprehensive README update

## Process: subagent-driven development

Used the subagent-driven-development skill — one implementer subagent per task, followed by spec compliance review, then code quality review.

### What worked

- **Fresh context per task** prevented confusion. Each subagent started clean and could focus.
- **Spec reviewers caught nothing wrong** — implementers were thorough. But the spec review process built confidence that the work was correct.
- **Code quality reviewers found real issues:**
  - Timing-safe comparison for auth token (fixed immediately)
  - `logo_url` returning raw file path instead of full URL (fixed in final review)
  - README documentation gaps (fixed in final review)
  - Pre-existing pattern gaps: no path traversal validation, no ownership check on DELETE, no file size limits
- **Two-stage review was valuable.** Spec review and code quality review caught different classes of problems.

### What didn't work / could improve

- **Subagents committed to a nested git repo.** The catalog-app has its own `.git` directory. The parent repo's `git status` showed all files as unstaged. This wasn't a blocker but could confuse future workflows. Need to decide: is catalog-app a submodule, or should it share the parent repo?
- **README quality varied.** The Gamma removal subagent rewrote the README but left stale references ("Deck Generator" title, "Vercel Postgres SDK", wrong health check path). The final cross-cutting review caught these. Lesson: individual task reviews are good at checking task-level correctness, but miss global consistency. The final holistic review is essential.
- **Pre-existing gaps propagated.** The plan said "follow product image patterns," so implementers replicated the same gaps (no ownership verification on DELETE, no error handling around fs+db operations, no file size limits). These are legitimate architectural debt from Phase 1. Task-level instructions to follow existing patterns are a double-edged sword.

## Known architectural debt — all resolved

These issues were identified during Phase 2 reviews and fixed in commit 615f0e6:

1. ~~**No path traversal protection on upload**~~ ✅ Added ID validation (`Number.isInteger && > 0`) and `path.resolve().startsWith()` boundary check
2. ~~**DELETE doesn't verify resource ownership**~~ ✅ DELETE now checks `brand_id`/`product_id` matches URL param before deleting
3. ~~**No error handling around fs+db operations**~~ ✅ try/catch with file cleanup on DB insert failure
4. ~~**No file size or content-type validation**~~ ✅ 10MB limit, extension whitelist (.jpg, .jpeg, .png, .gif, .webp, .svg)
5. ~~**Filename collision**~~ ✅ `crypto.randomBytes(4)` hex prefix on all uploaded filenames
6. ~~**`getProductsByIds` dead code**~~ ✅ Removed function and its tests

## What's next

Phase 3 (UI changes) is the next section in the plan:
- Brand image gallery on brand detail page
- Multi-file image upload component
- Reorganised product form (deck-critical fields at top)
