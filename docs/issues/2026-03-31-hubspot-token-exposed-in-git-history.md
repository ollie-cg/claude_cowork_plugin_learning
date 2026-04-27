# HubSpot Token Exposed in Git History

**Date:** 2026-03-31
**Status:** Resolved
**Severity:** Critical
**Discovered by:** GitHub secret scanning alert when repo went public (Simon review session)

## Summary

A HubSpot private app token (`pat-eu1-...`) was committed to the public repository. GitHub flagged the exposure when the repo was made public.

## Root cause

Commit `8a6ee22` ("Add .env file with HubSpot token") both:
1. Added `.env` containing the plaintext token to the repository
2. Removed the `.env` entry from `.gitignore`, disabling the protection that was already in place

## Impact

- The token granted full CRM API access (companies, contacts, deals, custom objects) to HubSpot account `24916652`
- The token was publicly visible in git history on GitHub from the time the repo went public until resolution

## Resolution (2026-03-31)

1. **Token revoked** — The exposed token was revoked in HubSpot (Settings → Integrations → Private Apps) and a new token was generated
2. **Git history cleaned** — Used `git filter-repo --invert-paths --path .env --force` to remove `.env` from all 62 commits in the repository history
3. **`.gitignore` restored** — Added `.env` back to `.gitignore` with the comment `# Environment variables (contains secrets)`
4. **Force pushed** — Cleaned history force pushed to `origin/main`, overwriting the contaminated remote history
5. **New token verified** — Tested the replacement token against three endpoints (owners, deals, custom object `0-970`) — all returned `200 OK`
6. **Confirmed no other leaks** — `.claude/settings.local.json` and `tests/runs/` (which also contained the old token locally) were never committed to git

## Prevention

- `.env` is now gitignored and will not be tracked
- No other files in the repo contain real tokens (docs use masked placeholders like `pat-eu1-...`)
- `tests/runs/` directory is gitignored to prevent test output containing tokens from being committed
