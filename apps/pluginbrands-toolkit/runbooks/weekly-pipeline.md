# Weekly Pipeline Runbook

Generates the per-brand weekly pipeline update markdowns + distribution zips for all 20 Plugin Brands clients. Designed to run end-to-end from a fresh `git clone` on any laptop once `.env` has a HubSpot PAT.

---

## 1. What this does

For a chosen `window-end` date (defaults to today), produces:

- 20 markdowns at `docs/temporary/{window-end}/{slug}.md` — one per brand, generated against the `brand-pipeline-report` skill spec.
- A distribution folder at `~/Downloads/pluginbrands-{window-end}/` containing `pipeline-reports/` (the 20 mds, flat) and `weekly-client-update-deck-skill/` (a copy of the deck skill).
- Two flat zips at `~/Downloads/`: `pluginbrands-pipeline-reports-{window-end}.zip` and `weekly-client-update-deck-skill-{window-end}.zip`.
- A summary table to the chat: per-brand line counts and any flagged warnings.

Window is a rolling 7 days: `window_start = window_end - 7 days`, both inclusive. Wins/losses on `window_start` therefore surface in two consecutive weeks — flag in the summary but don't dedupe.

---

## 2. Pre-flight: drift check

Before running, compare mtimes of the runner and the source-of-truth skill spec:

```bash
git log -1 --format=%ct -- apps/pluginbrands-toolkit/skills/brand-pipeline-report/SKILL.md
git log -1 --format=%ct -- apps/pluginbrands-toolkit/scripts/weekly_pipeline_run.py
```

If the skill is newer than the runner, the runner is potentially stale. Regenerate the runner from `SKILL.md` end-to-end (do not patch in place) and update the `Last regenerated from skills/...` header comment in the runner to today's date.

The runner also has all known rakes baked into inline comments — preserve them when regenerating:

- SSL CA bypass for Python 3.14 framework builds on macOS (`SSL_CTX.check_hostname = False; verify_mode = CERT_NONE`).
- `batch_read` with `propertiesWithHistory` caps at 50 IDs per call (other batch_reads cap at 100).
- Brand records duplicate ~hourly via a HubSpot workflow bug — dedupe by parsing `\[(\d+)\]` from `hs_name`, sort ASC by `hs_createdate`, first-occurrence-wins.
- Engagement IDs are monotonic — sort DESC, take top 15, batch_read at chunk=100.
- Section-isolation fences `<!-- DEAL_START {id} -->...<!-- DEAL_END {id} -->` go around every per-deal block.

---

## 3. Inputs

- `--window-end YYYY-MM-DD`: end of the reporting window (inclusive). Defaults to today if not provided in the user prompt.
- `HUBSPOT_TOKEN` in `.env` at repo root (PAT, prefix `pat-eu1-`). See `.env.example` for scopes.

**Do not use the HubSpot MCP connector** — incompatible auth-server / dynamic-client-registration. Use the PAT + the runner's direct REST calls.

---

## 4. Brand set

20 slugs (source of truth is `BRAND_SLUGS` in the runner; this list is for prompt-time clarity):

```
cans, ecotone-clipper, ecotone-kallo, ecotone-mrs-crimbles, glug, goodrays,
love-corn, moju, momo-kombucha, muller, muller-frijj, rawq, rewater, smol,
valeo-kettle, valeo-poppets, virtue, who-gives-a-crap, wow, xoxo-soda
```

The runner re-discovers each slug's canonical Client Services `hs_name` via the 0-162 search at run start. If a slug fails to resolve, the runner exits 2 with a candidate list — investigate before re-running (likely renamed or removed in HubSpot).

---

## 5. Execution

Fan out 20 background `bash` invocations of the runner — one per slug. The runner is single-brand by design; the script does have an `--all` sequential mode but Claude-orchestrated parallelism is faster and easier to monitor.

```bash
mkdir -p /tmp/weekly-pipeline-{window-end}
for slug in cans ecotone-clipper ecotone-kallo ecotone-mrs-crimbles glug goodrays \
            love-corn moju momo-kombucha muller muller-frijj rawq rewater smol \
            valeo-kettle valeo-poppets virtue who-gives-a-crap wow xoxo-soda; do
  python3 apps/pluginbrands-toolkit/scripts/weekly_pipeline_run.py \
    --window-end {window-end} --brand "$slug" \
    > /tmp/weekly-pipeline-{window-end}/$slug.json \
    2> /tmp/weekly-pipeline-{window-end}/$slug.log &
done
wait
```

In Claude, run each in a separate `Bash` call with `run_in_background=true`, then poll with `BashOutput` (or just wait — typical wall-clock is ~10-15 minutes for all 20). HubSpot 429s are handled by the runner's retry loop.

Check completion: `ls docs/temporary/{window-end}/*.md | wc -l` should equal 20. For any missing brand, inspect its log file in `/tmp/weekly-pipeline-{window-end}/`.

---

## 6. Distribution

After all 20 mds exist:

```bash
DEST=~/Downloads/pluginbrands-{window-end}
mkdir -p $DEST/pipeline-reports $DEST/weekly-client-update-deck-skill
cp docs/temporary/{window-end}/*.md $DEST/pipeline-reports/
cp -r apps/pluginbrands-toolkit/skills/weekly-client-update-deck/. $DEST/weekly-client-update-deck-skill/

cd $DEST/..
zip -r -j pluginbrands-pipeline-reports-{window-end}.zip pluginbrands-{window-end}/pipeline-reports/
zip -r -j weekly-client-update-deck-skill-{window-end}.zip pluginbrands-{window-end}/weekly-client-update-deck-skill/
```

The `-j` flag flattens — zips contain just files, no nested folders. This is intentional: the recipient pipeline (Claude → Gmail draft) expects flat input.

---

## 7. Summary template

After distribution, print to the chat (or save as `~/Downloads/pluginbrands-{window-end}/SUMMARY.md`):

```
# Weekly pipeline — {window-end}

Window: {window-start} → {window-end}

| Brand | Lines | Wins/Losses | Stage moves | New | Meetings | Notable | Still warm | Auto-attached |
|---|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

**Warnings:**
- collision: {brands with collision_warnings > 0}
- stale: {brands with stale_warnings > 0}
- slug drift: {brands where diverged_from_slug == true}
- empty brand records: {brands where brand_records_pre_dedupe == 0}

**Distribution:**
- ~/Downloads/pluginbrands-pipeline-reports-{window-end}.zip ({size})
- ~/Downloads/weekly-client-update-deck-skill-{window-end}.zip ({size})
```

The per-brand JSON stats from the runner's stdout drive these columns.

---

## 8. Known gotchas

- **`muller-frijj` returns 0 brand records** — Frijj deals are filed under "Muller" in `client_name_sync`. Flag in the summary; not a runner bug.
- **Wins/losses on `window_start`** surface in two consecutive weeks (window is inclusive both ends). Acceptable — flag with a "(also reported last week)" note if obvious from prior summaries.
- **~50% of attached deals at active clients are auto-attached only** — no brand-specific pitches or mentions. The runner classifies these into the `AUTO_ATTACHED_ONLY` bucket and omits them from per-deal blocks but counts them in the pipeline-snapshot table.
- **HubSpot Brand workflow duplicates records ~hourly** — the runner dedupes by `\[deal_id\]` substring with first-occurrence-wins (relies on ASC `hs_createdate` sort). If counts spike unexpectedly, check that the sort/dedupe path is intact.
- **First-run-of-the-day owners cache**: list_owners() runs per-brand. For a 20-brand parallel run, that's 20 owners-list calls. Acceptable but consider caching if you ever extend to 100+ brands.

---

## 9. Out of scope for this runbook

- Sending the client emails (separate skill: `weekly-client-update-deck`).
- Cron / scheduled triggering — runbook stays interactive.
- Editing the skill spec itself — see `apps/pluginbrands-toolkit/skills/brand-pipeline-report/SKILL.md`.
