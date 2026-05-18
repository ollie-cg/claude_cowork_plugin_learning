# Weekly Pipeline Runner — Promotion Plan

_Compiled 2026-05-18 after three successful weekly runs (2026-04-30, 2026-05-01, 2026-05-08). The runner lives in `tmp/` (untracked scratch) and needs to be moved into the repo so the workflow is reproducible on any laptop after a fresh `git clone`._

---

## 1. Goal

After `git clone` on a new laptop:
```bash
echo "HUBSPOT_TOKEN=pat-eu1-..." > .env
claude
> Run the weekly pipeline workflow per apps/pluginbrands-toolkit/runbooks/weekly-pipeline.md,
  window ending 2026-05-22.
```
…produces 20 brand mds + folder + 2 zips in `~/Downloads/`, no rediscovery cost.

---

## 2. Decisions taken (per 2026-05-18 conversation)

| Question | Decision |
|---|---|
| Commit the runner or regenerate-from-skill each week? | **Commit**, guard against drift via mtime check in the runbook. Runner has been stable across 3 runs; regenerating wastes ~15min and risks re-stepping on known rakes (SSL CA, 50-cap batch_read, ASC dedupe). |
| `brands.json` slug→hs_name file? | **No** — re-discover via Client Services (0-162 search) every run. The runner already does this; one search call costs ~1s. Slug list lives only in the runbook. |
| `.env.example`? | **Yes** — self-documenting new-laptop setup. |
| Drift-guard mechanism? | mtime comparison in the runbook: if `SKILL.md` is newer than the runner, rebuild the runner from the spec before running. |

---

## 3. File changes

### 3a. NEW: `apps/pluginbrands-toolkit/scripts/weekly_pipeline_run.py`

Adapt `tmp/runner_2026_05_08.py`. Changes:

- **CLI**: `argparse` taking `--window-end YYYY-MM-DD` (required), `--brand <slug>` (optional, runs one brand), `--all` (runs all 20 in sequence; parallelism is delegated to Claude via background bash invocations, not threaded inside the script).
- **Window**: `window_end` from CLI, `window_start = window_end - 7 days`, `today = window_end`.
- **REPO_ROOT**: `Path(__file__).resolve().parents[3]` — no hardcoded `/Users/ollie/...`.
- **Brand list**: hardcoded list of 20 slugs at the top of the script (this is the source of truth — runbook quotes it for prompt-time clarity but the runner is authoritative).
- **Slug→canonical**: re-discover via Client Services search at run start. If a slug doesn't resolve, exit 2 with the candidate list.
- **Output**: `{REPO_ROOT}/docs/temporary/{window_end}/{slug}.md` (already gitignored).
- **Stdout**: JSON stats per brand (same shape as today — used by the summary step).
- **Header comment**: `# Last regenerated from skills/brand-pipeline-report/SKILL.md on 2026-05-18.` — anchor for the drift check.

### 3b. NEW: `apps/pluginbrands-toolkit/runbooks/weekly-pipeline.md`

Claude-readable runbook. Sections:

1. **What this does** (1 paragraph).
2. **Pre-flight drift check**: `git log -1 --format=%ct -- apps/pluginbrands-toolkit/skills/brand-pipeline-report/SKILL.md` vs same for the runner script. If skill is newer, regenerate the runner from `SKILL.md` before continuing.
3. **Inputs**: `window-end` date (default: today). HUBSPOT_TOKEN in `.env`.
4. **Brand set** (20 slugs, no canonical hs_names — runner re-discovers).
5. **Execution**: fan out 20 background `bash` invocations of `python3 apps/pluginbrands-toolkit/scripts/weekly_pipeline_run.py --window-end {date} --brand {slug}`, one per slug. Wait for all to complete. HubSpot 429 retries are built into the runner.
6. **Distribution**: copy mds to `~/Downloads/pluginbrands-{window-end}/pipeline-reports/`, copy skill to `weekly-client-update-deck-skill/`, zip both flat.
7. **Summary template**: per-brand line counts, flagged warnings (collision / stale / auto-attached / mis-pipelined), slug-drift check.
8. **Known gotchas** (copied from current workflow): muller-frijj returning 0 brand records, window inclusivity causing wins to surface twice across consecutive weeks, ~50% auto-attached ratio at active clients.

Evergreen — no specific dates. Claude infers the window from `today` unless the user specifies.

### 3c. NEW: `.env.example` (repo root)

```
# HubSpot PAT for EU portal 24916652. Generate at:
#   https://app-eu1.hubspot.com/private-apps/24916652
# Scopes needed: crm.objects.{deals,contacts,custom}.read,
#                crm.schemas.{deals,contacts,custom}.read,
#                crm.objects.owners.read
HUBSPOT_TOKEN=pat-eu1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 3d. UPDATE: `.gitignore`

Add `tmp/` explicitly. It's currently untracked-by-accident; making it ignored prevents future scratch scripts from being staged by mistake.

### 3e. (Optional) `tmp/` cleanup

Leave alone for now — the existing scratch scripts are useful local references. Once the promotion is committed and one full weekly run has succeeded against the new path, can delete.

---

## 4. Verification

Before committing:

1. `python3 apps/pluginbrands-toolkit/scripts/weekly_pipeline_run.py --window-end 2026-05-15 --brand muller-frijj` — fast smoke test, should produce empty-week md.
2. `python3 apps/pluginbrands-toolkit/scripts/weekly_pipeline_run.py --window-end 2026-05-15 --brand glug` — verify a real brand still produces output matching the 2026-05-08 shape (compare to `docs/temporary/2026-05-08/glug.md` — counts will differ since window changed, but section structure should match).
3. `diff -u tmp/runner_2026_05_08.py apps/pluginbrands-toolkit/scripts/weekly_pipeline_run.py` — manual review of what was added (CLI, REPO_ROOT derivation) and what was removed (hardcoded paths/dates).

Don't run a full 20-brand cycle as a verification — too costly. The 2-brand smoke test plus diff is sufficient confidence.

---

## 5. Commit + push

Single commit on `main`:

```
feat(toolkit): promote weekly pipeline runner from scratch to versioned location

- apps/pluginbrands-toolkit/scripts/weekly_pipeline_run.py (CLI-driven, portable paths)
- apps/pluginbrands-toolkit/runbooks/weekly-pipeline.md (Claude-readable runbook with drift check)
- .env.example (HubSpot PAT placeholder)
- .gitignore: add tmp/

Enables the workflow to run on any laptop after `git clone` + .env setup.
Runner regenerated from skills/brand-pipeline-report/SKILL.md on 2026-05-18.
Drift guard documented in runbook.
```

Push to `origin/main`. No PR — solo repo, direct commit is the convention here based on recent history.

---

## 6. Open questions for Ollie

- **`--all` mode**: should the script's `--all` mode parallelise internally (subprocess/threading), or stay sequential and delegate parallelism to Claude (current plan)? Sequential + Claude-orchestrated is simpler and matches what worked last week. Parallel-in-script is faster but adds threading bugs to debug.
- **Tagging**: worth tagging the commit as `weekly-pipeline-v1` so future "rebuild the runner" instructions have a known-good reference point?

---

## 7. Out of scope

- Removing or restructuring `tmp/` historical scripts.
- Touching the skill specs themselves (this is purely a code-promotion change).
- Automating the weekly trigger (cron / scheduled agent) — runbook stays interactive for now.
- Email distribution automation (still Claude → Gmail via the deck skill, manually triggered).
