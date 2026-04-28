# Runbook — Stop Brand & Pitch Inflation

**Date:** 2026-04-28
**Owner:** Ollie (executor) + Simon (admin authority + rollback)
**Goal:** Stop the runaway duplicate creation of Brand and Product Pitch records.
**Approach:** Two HubSpot workflow config changes — no code edits, no Python changes, fully reversible.

> **Status: EXECUTED 2026-04-28T12:34Z–13:08Z. Loop is dead — verified across 5 cycle windows on a synthetic canary deal.** See [Execution outcome](#execution-outcome-2026-04-28) and [Post-execution monitoring](#post-execution-monitoring) at the bottom of this doc.

---

## Background (one-screen summary)

Two HubSpot workflows are responsible for the 32× inflation of Brand records (40,840 vs. expected ~1,300) and the ~3.9× inflation of Product Pitch records (24,763 vs. ~58 ever Placed):

1. **Workflow `3523907825` — `[NV-HS] Create brands from Deal in Discovery`**. When a Deal enters Discovery, runs Python custom code that creates one Project (Brand) per associated Service, then disassociates all Services from the Deal. Configured with `shouldReEnroll: true` and **no idempotency check**. Empirical evidence: a single Deal (Farmer J, `494017450175`) generated 528 duplicate Brand records over 3 days in a self-perpetuating loop; another (Royal Horticultural Society, `499552962753`) showed the same pattern. Cycle interval converges to ~1h 44m, consistent with HubSpot's automatic LIST_BASED workflow re-evaluation.

2. **Workflow `3585155261` — `[NV-HS] Create product pitch on Brand movement`**. When a Brand record's stage moves to "Brand Proposal" (`4447561936`), runs Python custom code that creates one Ticket (Pitch) per Client Product on the Brand's Service. **No idempotency check.** Each duplicate Brand promoted to Proposal generates a fresh batch of Pitches.

A third workflow (`3540255935` — `[NV-HS] Map Deal Stage to Brand Stage`) automatically cascades Deal stages onto Brand stages. We are leaving this on for now (see Risks).

For full investigation context: prior memo on workflow analysis lives in this repo's WORK memory; the broader plan lives in `2026-04-28-engagement-sequence.html`.

---

## Plan

| Step | Change | What it does | Reversibility |
|---|---|---|---|
| **2A** | `PATCH` Workflow `3585155261` → `isEnabled: false` | Stops Pitch auto-creation when a Brand moves to Proposal. | Single PATCH back to `true`. |
| **1B** | `PATCH` Workflow `3523907825` → `enrollmentCriteria.shouldReEnroll: false` | Workflow still runs once when a new Deal enters Discovery (preserves operator-visible behaviour) but cannot re-fire on the same Deal — kills the duplicate loop. | Single PATCH restoring original `enrollmentCriteria`. |

We do 2A first to take the louder side-effect (Pitch creation) off the table, soak briefly, then 1B.

---

## Risks and concerns

These are listed roughly in order of how much they should affect the go/no-go decision.

### 1. Queued re-enrollments may still fire after the change (most likely tail risk)

HubSpot does not document whether changing `shouldReEnroll` retroactively cancels enrollments already queued in the workflow's runtime. After the PATCH, deals already mid-cycle may still produce one or more additional duplicate Brand batches before the queue drains. Empirically, none are mid-cycle right now — last system-wide Brand creation was 2026-04-25 — so this risk is currently low. But for any deal that organically lands in Discovery in the gap between PATCH and queue settling, expect possibly one stray batch.

**Detection:** Phase 5 hourly heartbeat will catch it.
**Mitigation:** Accept up to ~24h of residual duplicates before declaring the fix not working. Above that, escalate.

### 2. The PATCH may not take effect as intended

HubSpot's `PATCH /automation/v4/flows/{id}` semantics for nested objects like `enrollmentCriteria` aren't crisp. Sending a partial object could be interpreted as "replace the whole object with this partial form", which would silently drop fields like `reEnrollmentTriggersFilterBranches` or `listFilterBranch`. The runbook handles this by sending the **complete** `enrollmentCriteria` object, modified only where needed (built via `jq` from the saved backup). But we should verify the post-PATCH state matches expectations before walking away.

**Detection:** Phase 1 and Phase 3 verify steps both `GET` the flow back and inspect every field that was supposed to change.
**Mitigation:** If verification fails, immediate rollback using the backup JSON.

### 3. `shouldReEnroll: false` stopping the loop is an inference, not a proven fact

The empirical 1h 44m exponential-backoff signature strongly suggests HubSpot's automatic LIST_BASED re-evaluation, which `shouldReEnroll: false` should disable. But I have not directly verified this — HubSpot's internal re-enrollment plumbing is not fully documented externally. If the loop has a different driver (e.g. an internal calculated-property cascade we haven't seen), 1B alone won't stop it.

**Detection:** Phase 4 canary deal — if its brand count grows across the 6-hour observation window, the inference was wrong.
**Mitigation:** Fallback to Option 1A (full disable of Workflow 1) — same toggle interface, larger blast radius, but definitively stops Brand creation.

### 4. Action 2 (Service↔Deal disassociate) still runs on every new Deal

1B does not touch Workflow 1's Action 2. So every new Deal entering Discovery will still have its direct Service associations severed after Brand creation. This means the team's "click every brand to see who's on this deal" workaround stays in place. It also means new Deals lose the canonical `Deal → Services` relationship.

**Detection:** Not strictly a failure mode — it's a known limitation of 1B. If anyone is starting to rely on Deal-direct Service associations for reporting, they'll continue to be blocked.
**Mitigation:** Out of scope for this runbook. Address in Phase 5 of the engagement plan (decide whether Brand auto-create should exist at all).

### 5. Workflow 2 (Deal stage → Brand stage cascade) is still active

A Deal moving to "Proposal" still cascades all associated Brand records to "Brand Proposal" stage. With 2A in place, no Pitches are created downstream — but Brand stage values now display "Brand Proposal" with **no backing Pitches**. Reports that count Pitches per Brand-at-Proposal will show zeros where previously they showed inflated noise. This is correct behaviour, but it's a visible change.

**Detection:** Inspect a Brand at Brand Proposal stage 24h post-change, confirm zero new Pitch associations.
**Mitigation:** Communicate to operators that Brand stage transitions no longer auto-create Pitches.

### 6. Operator behaviour change must be communicated explicitly

After 2A, an operator manually moving a Brand to "Brand Proposal" stage no longer triggers Pitch auto-creation. If they don't know, they will be confused — and may report this as "broken." This is the most likely source of internal friction.

**Detection:** Slack/email feedback.
**Mitigation:** Send a short note before flipping 2A. Suggested wording: *"As of [time], Pitches no longer auto-create when a Brand moves to Brand Proposal — please create Pitches manually as you actually pitch SKUs."*

### 7. Test deal creation (Phase 4 Option B) leaves a permanent artefact

If we use Option B in Phase 4 (create a fresh deal as canary), that test deal will have its Services severed by Action 2 and one Brand created per Service. Cleanup at the end requires explicitly archiving the test deal, the test Brand, and the (fortunately none) Pitches.

**Detection:** Note the test deal ID at creation time.
**Mitigation:** Phase 4 cleanup step (added below) archives the test deal and any associated Brands once the observation window closes.

### 8. PATCH attribution shows up under Ollie's token, not Simon's user

Both PATCHes will be logged in HubSpot's workflow history under the token's owning user. Simon won't see "I changed this" in his UI — he'll see the token user. If that's confusing for audit, alternative is to have Simon make the changes via UI (UI path documented below as fallback).

**Detection:** Workflow revision history.
**Mitigation:** Option to do both changes via UI rather than API. Both work identically.

### 9. Brand/Pitch creation via non-workflow paths is untouched

Manual creation via UI or external API calls is unaffected. If a script or integration outside Workflow 1/3 also creates Brands or Pitches, this runbook will not stop those. We have not seen evidence of such paths, but haven't audited every API call source.

**Detection:** Phase 5 heartbeat — if Brand creation continues at high volume on Deals not entering Discovery, look for non-workflow sources via the `sourceType` field on new Brand records.
**Mitigation:** Investigate per-record source if non-zero.

### 10. The 40,840 historical duplicate Brands and 24,763 Pitches remain

This runbook only stops new bleeding. The historical mess is unchanged. Reports built on Brand/Pitch counts will continue to show inflated numbers until cleanup runs (Issue 3 in the prior analysis — explicitly out of scope here).

**Detection:** N/A.
**Mitigation:** Plan and execute the cleanup runbook (separate doc) once 1B + 2A are stable for ≥1 week.

---

## Setup (run once)

```bash
export HS_TOKEN="$(grep HUBSPOT_TOKEN /Users/ollie/projects/ventures/consulting/plugin-brands/claude-plugin/.env | cut -d= -f2)"
export HS="Authorization: Bearer $HS_TOKEN"
export RUN_DIR="/Users/ollie/.claude/MEMORY/WORK/20260428-115031_inflation-fix-options/run"
mkdir -p "$RUN_DIR"
```

---

## Phase 0 — Backup current state

```bash
curl -s -H "$HS" "https://api.hubapi.com/automation/v4/flows/3523907825" > "$RUN_DIR/wf1-brands.before.json"
curl -s -H "$HS" "https://api.hubapi.com/automation/v4/flows/3585155261" > "$RUN_DIR/wf3-pitches.before.json"

{
  echo "Captured: $(date -u +%FT%TZ)"
  echo "Brand total: $(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
    "https://api.hubapi.com/crm/v3/objects/0-970/search" \
    -d '{"properties":[],"limit":1}' | jq -r '.total')"
  echo "Pitch total: $(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
    "https://api.hubapi.com/crm/v3/objects/0-420/search" \
    -d '{"properties":[],"limit":1}' | jq -r '.total')"
} | tee "$RUN_DIR/baseline.txt"

jq '{name, isEnabled, shouldReEnroll: .enrollmentCriteria.shouldReEnroll, revisionId}' "$RUN_DIR/wf1-brands.before.json"
jq '{name, isEnabled, revisionId}' "$RUN_DIR/wf3-pitches.before.json"
```

**Pass criteria:** Both backup files exist and parse cleanly. Both workflows show `isEnabled: true`. Workflow 1 shows `shouldReEnroll: true`.

---

## Phase 1 — Disable Workflow 3 (kill Pitch auto-creation)

> **Note:** HubSpot's `automation/v4/flows/{id}` endpoint does **not** support `PATCH` (returns `HTTP 405`). Use `PUT` with the full workflow body. We modify the saved backup, change `isEnabled`, and PUT the whole object back.

```bash
# Modify the WF3 backup with isEnabled: false
jq '.isEnabled = false' "$RUN_DIR/wf3-pitches.before.json" > "$RUN_DIR/wf3-disable.json"

curl -s -o "$RUN_DIR/wf3-put-response.json" -w "HTTP %{http_code}\n" \
  -X PUT -H "$HS" -H "Content-Type: application/json" \
  "https://api.hubapi.com/automation/v4/flows/3585155261" \
  -d @"$RUN_DIR/wf3-disable.json"

# Verify
curl -s -H "$HS" "https://api.hubapi.com/automation/v4/flows/3585155261" \
  | jq '{name, isEnabled, revisionId, updatedAt}'
```

**Pass criteria:** `HTTP 200`, `isEnabled: false`, `revisionId` bumped from `"5"`, `updatedAt` within the last minute.

---

## Phase 2 — Quick Pitch verify (no soak)

The Pitch loop has no exponential-backoff signature — it fires only on Brand stage transitions. With Workflow 3 disabled in Phase 1, no Pitches can be auto-created regardless of what happens upstream. A long soak isn't needed. One quick verification:

```bash
# Before-after Pitch totals at the moment of disable
PITCH_NOW() {
  curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
    "https://api.hubapi.com/crm/v3/objects/0-420/search" \
    -d '{"properties":[],"limit":1}' | jq -r '.total'
}
echo "$(date -u +%FT%TZ)  pitch_total: $(PITCH_NOW)" | tee "$RUN_DIR/phase2-pitch-snapshot.txt"
```

**Pass criteria:** Snapshot captured. The 24h heartbeat in Phase 5 catches any longer-term anomalies.

---

## Phase 3 — Disable re-enrollment on Workflow 1

Same approach as Phase 1: PUT the full workflow body with `shouldReEnroll` flipped to `false`.

```bash
# Modify the full WF1 body — shouldReEnroll false, everything else identical to backup
jq '.enrollmentCriteria.shouldReEnroll = false' \
  "$RUN_DIR/wf1-brands.before.json" > "$RUN_DIR/wf1-disable-reenroll.json"

curl -s -o "$RUN_DIR/wf1-put-response.json" -w "HTTP %{http_code}\n" \
  -X PUT -H "$HS" -H "Content-Type: application/json" \
  "https://api.hubapi.com/automation/v4/flows/3523907825" \
  -d @"$RUN_DIR/wf1-disable-reenroll.json"

curl -s -H "$HS" "https://api.hubapi.com/automation/v4/flows/3523907825" \
  | jq '{name, isEnabled, shouldReEnroll: .enrollmentCriteria.shouldReEnroll, revisionId, updatedAt}'
```

**Pass criteria:** `HTTP 200`, `shouldReEnroll: false`, `isEnabled: true`, `revisionId` bumped from `"11"`, `updatedAt` within the last minute.

---

## Phase 4 — Controlled live test (30-minute compressed)

No deals are currently mid-cycle, so we trigger one ourselves. The original Brand-creation cycle's first 5 firings all happen within 25 minutes (1m25s, 3m28s, 9m26s, 25m intervals). A 30-minute observation therefore covers 5 cycle windows — strong empirical signal without a long wait.

### Test fixture

- **Test Service**: `[TEST] Clearwater - Client Pipeline Run` (id `1175145696448`). Already labelled as test data, has 0 Brand associations and 0 Course associations — cleanest possible baseline and zero accidental Pitch surface area.
- **Test pipeline**: Buyer Deal Pipeline (`2760762586`).
- **Test stage**: Discovery (`4443390193`).

### Create the canary

> **Note:** Deal → Service association uses `associationTypeId: 795` (HUBSPOT_DEFINED). Type `1` is Deal → Contact. To rediscover for any other object pair, query `/crm/v4/associations/{from}/{to}/labels`.

```bash
TEST_SERVICE_ID="1175145696448"

curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/deals" \
  -d "{
    \"properties\": {
      \"dealname\": \"TEST_INFLATION_FIX_$(date -u +%Y%m%d%H%M)\",
      \"dealstage\": \"4443390193\",
      \"pipeline\": \"2760762586\"
    },
    \"associations\": [{
      \"to\": {\"id\": \"$TEST_SERVICE_ID\"},
      \"types\": [{\"associationCategory\": \"HUBSPOT_DEFINED\", \"associationTypeId\": 795}]
    }]
  }" | tee "$RUN_DIR/canary-deal.json" | jq '{id, name: .properties.dealname, created: .properties.createdate}'
```

### Watch loop — every 2 minutes for 30 minutes

```bash
export CANARY_DEAL="$(jq -r '.id' "$RUN_DIR/canary-deal.json")"
CANARY_BRAND_COUNT() {
  curl -s -H "$HS" "https://api.hubapi.com/crm/v4/objects/0-3/$CANARY_DEAL/associations/0-970" \
    | jq -r '.results | length'
}

for i in $(seq 1 15); do
  echo "$(date -u +%FT%TZ)  sample $i  canary_brand_count: $(CANARY_BRAND_COUNT)" \
    | tee -a "$RUN_DIR/phase4-canary.log"
  sleep 120
done
```

### Pass criteria

- Within 1 minute of canary creation: brand count = 1 (one Brand for the one Service initially attached).
- Across all 15 samples: brand count stays at 1. Any growth → rollback immediately (loop is still firing).

### Phase 4 cleanup (once observation closes)

```bash
# Capture the Brand created so we can archive it explicitly (Deal delete does NOT cascade Brand archive)
CANARY_BRAND=$(curl -s -H "$HS" "https://api.hubapi.com/crm/v4/objects/0-3/$CANARY_DEAL/associations/0-970" | jq -r '.results[0].toObjectId')

# Archive the test Brand
curl -s -X DELETE -H "$HS" "https://api.hubapi.com/crm/v3/objects/0-970/$CANARY_BRAND"

# Archive the test Deal
curl -s -X DELETE -H "$HS" "https://api.hubapi.com/crm/v3/objects/deals/$CANARY_DEAL"

echo "Cleaned up: deal $CANARY_DEAL, brand $CANARY_BRAND"
```

---

## Phase 5 — Long-haul monitoring (24 hours)

```bash
HOURLY_HEARTBEAT() {
  local since_ms=$(($(date -u +%s%3N) - 3600000))
  local brands=$(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
    "https://api.hubapi.com/crm/v3/objects/0-970/search" \
    -d "{\"filterGroups\":[{\"filters\":[{\"propertyName\":\"hs_createdate\",\"operator\":\"GTE\",\"value\":\"$since_ms\"}]}],\"properties\":[],\"limit\":1}" \
    | jq -r '.total')
  local pitches=$(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
    "https://api.hubapi.com/crm/v3/objects/0-420/search" \
    -d "{\"filterGroups\":[{\"filters\":[{\"propertyName\":\"hs_createdate\",\"operator\":\"GTE\",\"value\":\"$since_ms\"}]}],\"properties\":[],\"limit\":1}" \
    | jq -r '.total')
  echo "$(date -u +%FT%TZ)  brands_1h: $brands  pitches_1h: $pitches"
}

for i in $(seq 1 24); do
  HOURLY_HEARTBEAT | tee -a "$RUN_DIR/phase5-heartbeat.log"
  sleep 3600
done
```

### Pass criteria after 24 hours

- Sum of `pitches_1h` ≈ 0 unless an operator manually moved a Brand to Brand Proposal.
- `brands_1h` ≤ N where N = number of new Deals organically entering Discovery in that window. Spot-check 3 random new Discovery deals from the period — each should have brand count = service count, not growing.

---

## Decision matrix

| Observation | Meaning | Action |
|---|---|---|
| Canary brand count constant across 12 samples (6h) | 1B working | Continue Phase 5 |
| Canary brand count grows | 1B not effective | Rollback 1B, escalate to 1A |
| `pitches_1h` consistently 0 over 24h | 2A working | Plan cleanup runbook (Issue 3) |
| `pitches_1h` shows non-zero values | 2A may not be working OR humans creating | Inspect each Pitch's `sourceType` — if INTEGRATION `28195309`, rollback; if HUBSPOT/USER, manual creation (fine) |
| `brands_1h` spikes | Either organic deal creation OR loop returning | Spot-check 3 deals from that hour — multiple Brands per Service = loop |

---

## Rollback

Have these ready in another terminal **before** Phase 1. Both use PUT against the saved backup JSONs.

```bash
# Restore Workflow 3 — re-PUT the unmodified backup
curl -s -o /dev/null -w "WF3 rollback HTTP %{http_code}\n" \
  -X PUT -H "$HS" -H "Content-Type: application/json" \
  "https://api.hubapi.com/automation/v4/flows/3585155261" \
  -d @"$RUN_DIR/wf3-pitches.before.json"

# Restore Workflow 1 — re-PUT the unmodified backup
curl -s -o /dev/null -w "WF1 rollback HTTP %{http_code}\n" \
  -X PUT -H "$HS" -H "Content-Type: application/json" \
  "https://api.hubapi.com/automation/v4/flows/3523907825" \
  -d @"$RUN_DIR/wf1-brands.before.json"

# Verify
curl -s -H "$HS" "https://api.hubapi.com/automation/v4/flows/3523907825" \
  | jq '{isEnabled, shouldReEnroll: .enrollmentCriteria.shouldReEnroll, revisionId}'
curl -s -H "$HS" "https://api.hubapi.com/automation/v4/flows/3585155261" \
  | jq '{isEnabled, revisionId}'
```

---

## Pre-execution checklist

- [ ] Simon has read this runbook and OK'd it
- [ ] Issy and Danny notified that Pitches will no longer auto-spawn from Brand stage moves
- [ ] Owner of 24h monitoring confirmed (default: Ollie)
- [ ] Rollback authority confirmed (default: Simon — if changes need reverting, he says go)
- [ ] HubSpot token in `.env` confirmed valid (`curl -s -H "$HS" https://api.hubapi.com/crm/v3/owners | head` returns 200)
- [ ] Phase 0 backup files captured

---

## Out of scope (next runbooks)

- **Cleanup of historical 40,840 duplicate Brands and 24,763 Pitches.** Should be planned separately once this runbook is stable for at least one week. Two candidate approaches: (a) targeted dedup on `(deal_id, service_id)` keeping oldest; (b) safer mass archive of Brands at "Brand Pitched" with zero engagements and zero placed pitches.
- **Deciding whether Brand auto-creation should exist at all.** Engagement plan Phase 4 work — depends on operator 1:1s and a strategic call with Simon and Charlie.
- **Removing Action 2 (the destructive Service↔Deal disassociate).** Out of scope here; this runbook intentionally preserves it to keep behaviour change minimal.

---

## Execution outcome (2026-04-28)

Executed by Ollie via API token between **12:34Z and 13:08Z** on 2026-04-28. Sequence completed without rollback.

### State changes applied

| Workflow | Change | Before | After | Revision |
|---|---|---|---|---|
| `3585155261` (`Create product pitch on Brand movement`) | Disabled | `isEnabled: true` | `isEnabled: false` | 5 → 6 |
| `3523907825` (`Create brands from Deal in Discovery`) | Re-enrollment off | `shouldReEnroll: true`, `isEnabled: true` | `shouldReEnroll: false`, `isEnabled: true` | 11 → 12 |

Backup JSONs of both workflows (pre-change) saved at `~/.claude/MEMORY/WORK/20260428-115031_inflation-fix-options/run/wf{1,3}-*.before.json`. Rollback is a single PUT of either backup.

### Canary test result

Test deal `501003261145` (`TEST_INFLATION_FIX_202604281236`) created at 12:36:16Z in Discovery with one Service (`[TEST] Clearwater - Client Pipeline Run`, id `1175145696448`) attached.

| Sample | Time elapsed | Brand count | Cycle window covered |
|---|---|---|---|
| 1 | T+1m | 1 | First fire (expected — workflow runs once) |
| 2 | T+5m | 1 | Past the 1m25s and 3m28s firing windows |
| 3 | T+15m | 1 | Past the 9m26s window |
| 4 | T+24m | 1 | Past the 25m window |
| 5 | T+30m | 1 | All five rapid-cycle windows clean |

In the original Farmer J pattern, by T+30m we would have observed **5 batches** of duplicate Brands. We observed zero duplicates.

### Cleanup confirmed

| Object | ID | DELETE | GET (post-delete) |
|---|---|---|---|
| Test deal | `501003261145` | HTTP 204 | HTTP 404 |
| Test brand | `1204357079246` | HTTP 204 | HTTP 404 |

### Corrections to the original runbook (now baked in above)

- **`PATCH` on `automation/v4/flows/{id}` returns HTTP 405.** Use `PUT` with the full workflow body. The runbook commands above have been updated to use PUT.
- **Deal → Service association uses `associationTypeId: 795`, not `1`.** Type `1` is Deal → Contact. The canary creation block has been corrected.

---

## Post-execution monitoring

### Things to check at intervals

The 30-minute canary covered 5 of the 5 rapid-fire cycle windows. The two remaining unknowns are: (a) is there a longer-tail re-firing mechanism we haven't seen yet? and (b) does any other code path create duplicate Brands or Pitches? Both surface within hours, not days.

#### T+1 hour (one quick check)

```bash
HS="Authorization: Bearer $(grep HUBSPOT_TOKEN /Users/ollie/projects/ventures/consulting/plugin-brands/claude-plugin/.env | cut -d= -f2)"

# Brand and Pitch totals — compare to baseline 40,840 / 24,763
echo "Brand total: $(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
  https://api.hubapi.com/crm/v3/objects/0-970/search \
  -d '{"properties":[],"limit":1}' | jq -r .total)"
echo "Pitch total: $(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
  https://api.hubapi.com/crm/v3/objects/0-420/search \
  -d '{"properties":[],"limit":1}' | jq -r .total)"

# Workflow states still as we left them
curl -s -H "$HS" https://api.hubapi.com/automation/v4/flows/3523907825 \
  | jq '{shouldReEnroll: .enrollmentCriteria.shouldReEnroll, isEnabled, revisionId}'
curl -s -H "$HS" https://api.hubapi.com/automation/v4/flows/3585155261 \
  | jq '{isEnabled, revisionId}'
```

**What "all good" looks like:**
- Brand total ≈ 40,840 + (small number, e.g. 0–5). The small number = real new Discovery deals × Services per deal.
- Pitch total = 24,763 (or +0). Any increase here is significant — investigate the source.
- WF1: `shouldReEnroll: false`, `isEnabled: true`, `revisionId: "12"`.
- WF3: `isEnabled: false`, `revisionId: "6"`.

**Red flag:** Brand total grew by more than ~10. Run the spot-check below.

#### T+4 hours and T+24 hours (the meaningful checkpoints)

Same totals check as above, plus:

```bash
# How many Brand records were created in the last hour?
SINCE=$(($(date -u +%s%3N) - 3600000))
echo "Brands created last 1h: $(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
  https://api.hubapi.com/crm/v3/objects/0-970/search \
  -d "{\"filterGroups\":[{\"filters\":[{\"propertyName\":\"hs_createdate\",\"operator\":\"GTE\",\"value\":\"$SINCE\"}]}],\"properties\":[],\"limit\":1}" | jq -r .total)"

# Same for Pitches
echo "Pitches created last 1h: $(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
  https://api.hubapi.com/crm/v3/objects/0-420/search \
  -d "{\"filterGroups\":[{\"filters\":[{\"propertyName\":\"hs_createdate\",\"operator\":\"GTE\",\"value\":\"$SINCE\"}]}],\"properties\":[],\"limit\":1}" | jq -r .total)"
```

**What "all good" looks like:**
- "Brands created last 1h" = small number (≤ N services × number of new Discovery deals in that hour). For most hours this will be 0.
- "Pitches created last 1h" = 0 unless someone manually created one.

**Red flag:** "Brands created last 1h" > 20. That would be the loop returning. Spot-check immediately.

#### Spot-check any single Discovery deal (run this if numbers look off)

```bash
# Pick the most recently-created Buyer Deal and inspect its Brand count
DEAL_ID=$(curl -s -X POST -H "$HS" -H "Content-Type: application/json" \
  https://api.hubapi.com/crm/v3/objects/deals/search \
  -d '{"filterGroups":[{"filters":[{"propertyName":"dealstage","operator":"EQ","value":"4443390193"}]}],"sorts":[{"propertyName":"createdate","direction":"DESCENDING"}],"properties":["dealname"],"limit":1}' \
  | jq -r '.results[0].id')

echo "Most recent Discovery deal: $DEAL_ID"
echo "Brand count: $(curl -s -H "$HS" \
  https://api.hubapi.com/crm/v4/objects/0-3/$DEAL_ID/associations/0-970 \
  | jq -r '.results | length')"
echo "Service count: $(curl -s -H "$HS" \
  https://api.hubapi.com/crm/v4/objects/0-3/$DEAL_ID/associations/0-162 \
  | jq -r '.results | length')"
```

**What "all good" looks like:** Brand count = the number of Services that were attached to the deal at creation (typically 1–N depending on operator action). Wait an hour and re-check — count must be **stable**.

**Red flag:** Brand count grows between two checks of the same deal. That is the duplicate loop, and we should rollback Workflow 1 immediately using the Rollback section above.

### What to look for in HubSpot UI

- **Workflows panel** (Settings → Automation → Workflows): both `[NV-HS] Create brands from Deal in Discovery` and `[NV-HS] Create product pitch on Brand movement` should reflect their new state. The first stays "On" but its trigger settings show "Re-enrollment: off". The second is "Off".
- **Workflow revision history**: Workflow 1 should show revision 12, Workflow 3 should show revision 6. Both should have an entry attributed to "Plugin Brands MCP" or whichever integration owns the token.
- **Activity feeds on any Discovery deal**: should show Brand creation events tied to deal-creation/Discovery-entry, but **no further Brand creation events** for that same deal afterwards.

### When to declare success

- ✅ At T+24h: Brand total has grown only in proportion to genuinely new Discovery deals × their Services. Pitch total flat. Both workflows still in their changed state. → Stable.
- ✅ At T+1 week with the same picture: declare it solid and start planning the cleanup runbook for the historical 40k+ duplicate Brands.

### When to roll back

- ❌ Any single Discovery deal accumulates more than one Brand per Service over time.
- ❌ Pitch creation observed via integration source `28195309` (= the workflow custom code app). If you see this in any new Pitch's `propertiesWithHistory.hs_name`, the disable didn't take effect.
- ❌ Brand creation rate over any single hour exceeds 20.

Roll back using the Rollback section above. Both backups are in `~/.claude/MEMORY/WORK/20260428-115031_inflation-fix-options/run/`.
