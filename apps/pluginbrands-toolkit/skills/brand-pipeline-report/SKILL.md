---
name: brand-pipeline-report
description: MUST USE when the user asks for a buyer pipeline report, pipeline overview, or deal-by-deal summary for a specific PluginBrands client brand (e.g. "pipeline report for Love Corn", "show me MOJU's pipeline", "what's the pipeline for CANS", "generate a brand pipeline report"). Produces a Markdown report grouped by live Deal stage with owner, sites, route to market, close date, engagement counts, and summaries of the most recent email/meeting per deal.
---

# Brand Pipeline Report

Generate a Markdown buyer-pipeline report for one PluginBrands client brand.

## Prerequisites

Use the `hubspot-api-query` skill for data model and API mechanics. This skill assumes those conventions (object type IDs, pipeline IDs, portal `24916652`, EU datacenter).

## Input

**Client brand name** (e.g. "Love Corn", "MOJU"). Matches `client_name_sync` on Brand records. If the user doesn't specify one, run step 1 and ask them to pick.

## Procedure

### 1. Confirm the brand exists

Search Client Services to get the canonical name:

- Tool: HubSpot `search_objects`
- `objectType`: `0-162`
- `properties`: `["hs_name"]`
- `limit`: 100

Match the user's input to an `hs_name` (case-insensitive; tolerate trailing whitespace). If ambiguous, list candidates and ask.

### 2. Fetch ALL Brand records for the client (paginate fully)

Active clients return 2,000-3,500+ Brand records due to the ~hourly duplicate-Brand workflow bug. **Full pagination is mandatory** — do NOT stop after the first page.

- Tool: HubSpot `search_objects`
- `objectType`: `0-970`
- `filterGroups`: `[{"filters": [{"propertyName": "client_name_sync", "operator": "EQ", "value": "<brand name>"}]}]`
- `properties`: `["hs_name", "hs_createdate", "hs_pipeline_stage"]`
- `limit`: 200
- `sorts`: `[{"propertyName": "hs_createdate", "direction": "ASCENDING"}]`
- Loop on `paging.next.after` until it's absent.

ASC sort matters: the first Brand record created for a (deal × client) pair is the **canonical** one. All subsequent copies are workflow-bug duplicates.

### 3. Dedupe to one canonical Brand per deal

Each Brand `hs_name` follows the format `CLIENT / BUYER [DEAL_ID]`. Extract the bracketed Deal ID with regex `\[(\d+)\]`. Keep only the **earliest-created** Brand record per `deal_id` (since results are ASC-sorted, this is just "first occurrence wins").

Output: a `{deal_id → {brand_id, buyer_name}}` map. Count of unique deals = expected report size. No "partial dedupe" disclaimers — full pagination means the count is authoritative.

### 4. Batch-read the Deals (source of truth for stage)

- Tool: HubSpot `batch_read`
- `objectType`: `deals`
- `ids`: all unique deal IDs from step 3
- `properties`: `["dealname", "dealstage", "pipeline", "hubspot_owner_id", "hs_createdate", "closedate", "route_to_market", "notes_last_contacted", "num_notes", "num_associated_contacts", "number_of_sites"]`

Filter results to `pipeline == "2760762586"` (Buyer Deal Pipeline). Deals in other pipelines (legacy client-named pipelines) are excluded — they represent pre-Brand-model outreach. Note the excluded count in the report summary if non-zero.

Some IDs will 404 (archived deals). Drop them silently.

### 5. Fetch owners once

- Tool: HubSpot `list_owners`

Build an `{id → "FirstName LastName"}` map.

### 6. Fetch engagements per deal (parallel)

For each deal where `num_notes > 0`:

- Tool: HubSpot `get_associations`
- `objectType`: `deals`
- `objectId`: `<deal id>`
- `toObjectType`: `0-4`

Engagement IDs are monotonically increasing — the highest numeric ID is the most recent. Pick the latest **10** per deal. The latest 2 of those 10 will be used for the Recent exchanges bullet; all 10 inform the Summary.

### 7. Batch-read engagement bodies

- Tool: HubSpot `batch_read`
- `objectType`: `0-4`
- `ids`: all unique engagement IDs collected (split into batches of ≤100)
- `properties`: `["hs_engagement_type", "hs_email_subject", "hs_body_preview", "hs_meeting_title", "hs_note_body", "hs_timestamp", "hs_email_direction", "hubspot_owner_id"]`

**Content-field rules:**
- `0-4` is the generic engagement container — emails, meetings, and literal notes all use it.
- `hs_note_body` is populated only for actual Notes (rare). Do not rely on it.
- For emails (`hs_engagement_type` = `EMAIL` or `INCOMING_EMAIL`): use `hs_body_preview` (truncated body) and `hs_email_subject`.
- For meetings (`hs_engagement_type` = `MEETING`): use `hs_meeting_title`. Body is usually empty.
- `hs_body_preview` is the most universal — use it for all types and fall back to meeting title when the preview is null.

### 7a. Write per-deal Summary (grounded in fetched thread)

For each deal where `num_notes > 0`, produce **1-2 sentences** that make the deal's current state scannable. The goal is: a reader skimming the report should instantly know "where is this deal at" without opening the thread.

**What a good Summary does (the primary job — deal momentum):**

Capture the deal's current trajectory in plain language. Examples of the shape we want:
- "Spoke to {Role/Name} who is keen to try samples — waiting on {action} since {date}."
- "Sent 3 chaser emails since {date}, no reply."
- "Meeting booked for {date} to walk through the deck."
- "Buyer said no to the portfolio — listing closed on {date}."
- "Email bounced ({address verbatim}) — contact invalid."
- "Introduced to {distributor/colleague} on {date}; awaiting their follow-up."
- "Out of office until {date}; last substantive reply on {date}."

Lead with what actually happened and where the ball sits now. Include the {CLIENT} brand name when the thread engages with it specifically — that detail sharpens the summary. When the thread is portfolio-wide, describe the deal state without fabricating brand-specific content.

- **Sentence 1 — Deal state:** what's happened, who's involved by role/name, and the current momentum (samples requested, meeting booked, awaiting reply, declined, bounced). Cite concrete detail when present (contact name, sample count, site count, distributor, date).
- **Sentence 2 — Next action / blocker (optional, merge into sentence 1 when tight):** what we're waiting on and since when, **date-stamped from the single most recent engagement's `hs_timestamp`**. Flag auto-replies / OOO as the current state explicitly ("OOO until {date}; no substantive reply since {earlier date}").

**Brand-specificity (secondary — include when useful, don't force):**
- Scan bodies for {CLIENT} brand name / products / client-specific stockist or pricing detail. If present, weave it into the state sentence (e.g. "Buyer asked for Clipper Pyramid samples on {date}").
- If the thread is entirely portfolio-wide with no {CLIENT} mention, write the state summary without {CLIENT} detail — do NOT invent brand-specific content. A brief `({CLIENT} not mentioned in thread)` parenthetical is fine if it adds clarity; otherwise omit.
- **Cross-linked thread detection:** If the fetched engagements clearly belong to a different deal (different buyer name, unrelated subject line, foreign venue), state this transparently — e.g. "Fetched engagements are cross-associated with the {OTHER_DEAL} thread; no {THIS_DEAL}-specific activity visible." Do NOT describe foreign content as if it belongs to this deal.

**Summary integrity rules (CRITICAL):**
- Every factual claim in the Summary MUST trace to a specific engagement body fetched in step 7. Do NOT paraphrase the Recent exchanges bullet. Do NOT summarise from an existing MD file. Do NOT invent buyer intent.
- Ignore auto-replies and out-of-office bodies for content extraction — but DO cite them as the current state if they are the most recent engagement.
- Flag undeliverable NDRs / bounced emails as actionable state with the bounced address verbatim.
- Use concrete nouns: brand names, venue names, distributor names, real dates. Don't generalise to "the buyer is considering the portfolio".
- Do not land Sentence 2 on a stale blocker (e.g. "waiting for Oz to return from 30 March AL") when later engagements exist. The blocker must be consistent with the thread's most recent state.
- If the fetched thread is < 3 substantive engagements, the Summary can be one sentence.
- If `num_notes = 0`, omit the Summary field entirely AND omit Recent exchanges.
- If `num_notes > 0`, Summary AND Recent exchanges are BOTH required — even if only one engagement exists (show that one under Recent exchanges).

### 7b. Write per-deal "This week" field (last 7 days)

For each deal, inspect the fetched engagements and select any with `hs_timestamp` within the last 7 days (rolling, i.e. `>= today - 7`).

- **If zero qualifying engagements → omit the field entirely.** Do not render an empty "This week" line.
- **If one or more qualifying engagements → render a one-liner: `{activity summary}. Next: {action}.`**

**Activity summary (what happened):**
Describe the thread's movement in the last 7 days in concrete terms — who did what, which direction, key signal. Examples:
- "Buyer replied keen on samples; meeting booked for 2026-04-30."
- "Sent 2 chasers after 2-week silence."
- "OOO auto-reply received Tue; real reply Wed confirming call."
- "Meeting held Mon; action items logged."
- "Bounce notice Thu — contact invalid."
- "Intro made to {Name} on Wed; awaiting their reply."

**Next step (what to do now):**
One crisp action derived from the activity. Don't speculate beyond the thread. Examples:
- "Next: deliver samples ahead of the 30 Apr call."
- "Next: final follow-up then close to No Response."
- "Next: wait for {Name}'s reply."
- "Next: find alternate contact at {company}."
- "Next: send thank-you + recap of action items."
- "Next: resume contact after {return date}."

**Rules:**
- Use last 7 calendar days (rolling), not the ISO week. Cut-off = `today - 7 days`.
- This field stacks ON TOP of Summary — it's the "what's new" pulse, Summary is the "overall state". They serve different scans.
- If an engagement is in-window but is only a MAILER-DAEMON / automated system notice, describe the system event ("bounce notice", "calendar invite auto-accept") rather than quoting the bot.
- Never invent next steps. If the next step is genuinely unclear from the thread, write "Next: review and decide on follow-up cadence."

### 8. Roll up Product Pitches per deal

For each canonical Brand from step 3, fetch associated Product Pitches (`0-420`) via `/crm/v3/objects/0-970/{brand_id}/associations/0-420`. Batch-read the pitches with `properties: ["hs_name", "hs_pipeline_stage"]`.

Product Pitch stage IDs:

| Stage ID | Name |
|---|---|
| `6f14f8f1-407b-4b5b-99a7-db681b779076` | Proposed |
| `4549842107` | Negotiation |
| `4549842108` | Product Placed |
| `4549842109` | Declined |
| `4549842110` | Discontinued |

Per deal, compute `{total, placed, declined, proposed, other}` counts. Render as `"N pitches (P placed / D declined / Pr proposed)"` or `"no pitches"` if zero.

Data quality note: operators rarely move Product Pitch stages past "Proposed" — most deals (even Won) show `0P/0D/NPr`. State this rollup faithfully; don't invent placements.

### 9. Group by live Deal stage

Use the Deal's `dealstage` as the grouping key — **not** the Brand record's stage. The Brand pipeline cascade is off by one stage from the Deal pipeline, so reading the Brand stage produces systematically wrong labels.

Buyer Deal Pipeline (`2760762586`) stage IDs — **verified**, use exactly these mappings:

| # | Stage | Stage ID | Closed? |
|---|---|---|---|
| 0 | Discovery | `4443390193` | No |
| 1 | Follow Up | `4443390194` | No |
| 2 | Feedback Pending | `4443390195` | No |
| 3 | Feedback Received | `4443390196` | No |
| 4 | Proposal | `4443390197` | No |
| 5 | Proposal Feedback Pending | `4443390198` | No |
| 6 | Won | `4443390199` | Yes |
| 7 | Lost | `3774636266` | Yes |
| 8 | No Response | `4443390200` | Yes |

Order stages in the report: Discovery → Follow Up → Feedback Pending → Feedback Received → Proposal → Proposal Feedback Pending → Won → Lost → No Response. Skip stages with zero deals. Within each stage, order buyers by `notes_last_contacted` descending (most active first); deals with no contact go last.

### 10. Write the Markdown file

Path: `docs/temporary/{YYYY-MM-DD}/{brand-slug}.md`

- Date = today's date, `YYYY-MM-DD`. Used as the containing folder; create it if it doesn't exist.
- `brand-slug` = lowercase, spaces → hyphens, remove punctuation. Examples: `Love Corn` → `love-corn`, `MOMO Kombucha` → `momo-kombucha`, `Ecotone - Clipper` → `ecotone-clipper`.

## Output structure

```markdown
# {Brand Name} — Buyer Pipeline

_Generated {YYYY-MM-DD} from HubSpot. Grouped by live Deal stage (Buyer Deal pipeline `2760762586`)._

## Summary

| Stage | Buyers |
|---|---|
| Discovery | N |
| Follow Up | N |
| Feedback Pending | N |
| Feedback Received | N |
| Proposal | N |
| Proposal Feedback Pending | N |
| Won | N |
| Lost | N |
| No Response | N |
| **Total unique deals** | N |

_{Pre-dedup Brand-record count} total Brand records paginated; deduped to {N} unique Buyer Deal Pipeline deals. {Excluded count} deal(s) in legacy client-named pipelines were excluded._

---

## {Stage Name} (N)

### {Buyer Name} — deal [`{id}`](https://app-eu1.hubspot.com/contacts/24916652/record/0-3/{id})
- **Owner:** {Owner name}  •  **Created:** {YYYY-MM-DD} ({X} days ago)  •  **Projected close:** {YYYY-MM-DD}
- **Sites:** {n or —}  •  **Route to market:** {value or —}  •  **Contacts linked:** {n}
- **Pitches:** {N pitches (P placed / D declined / Pr proposed) or "no pitches"}
- **Activity:** {num_notes} engagements, last contact {YYYY-MM-DD or "no recorded contact"}
- **This week:** {activity summary}. Next: {action}. _(omit entire bullet if no engagements in last 7 days)_
- **Summary:** {deal state sentence}. _(omit if num_notes = 0)_
- **Recent exchanges:** _(omit this bullet entirely if num_notes = 0)_
  - {YYYY-MM-DD} — {sender description}: _"{cleaned body preview}"_
  - {YYYY-MM-DD} — {earlier exchange}
```

## Formatting rules

- **Deal URL:** `https://app-eu1.hubspot.com/contacts/24916652/record/0-3/{deal_id}` — portal ID is always `24916652`.
- **Empty fields:** render as em-dash `—`, not `null` or `N/A`.
- **Sender description in exchanges:**
  - `hs_engagement_type` = `EMAIL` → `"{Owner name} sent"` (outbound).
  - `hs_engagement_type` = `INCOMING_EMAIL` → `"{Contact name if parseable from body, otherwise 'Contact'} replied"`.
  - `hs_engagement_type` = `MEETING` → `Meeting logged: "{hs_meeting_title}"`.
- **Body quotes:** quote `hs_body_preview` directly, but strip trailing email signature blocks (name + job title + phone + address) and legal disclaimer boilerplate when obvious. Don't paraphrase. Keep under ~50 words per quote; truncate with `…` if longer.
- **"days ago"** calculated from today vs. `hs_createdate`.

## Do NOT include

- A "Data flags" section.
- A "Method" section.
- Raw JSON or field dumps.
- Any reference to the Brand pipeline stages (these are cascaded from Deal stages and often stale).

Report ends after the last stage section. No footer.
