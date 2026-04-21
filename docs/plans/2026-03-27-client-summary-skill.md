# Client Summary Skill Implementation Plan

> **⚠️ DEPRIORITISED (2026-04-21, v1.2.0):** The `client-summary` skill was removed from the shipped plugin. This doc is preserved for reference but is not under active development.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `client-summary` skill that summarises a client's pipeline status, buyer breakdown, and recent activity from HubSpot data.

**Architecture:** Single prompt-based skill (`SKILL.md`) following the same pattern as `hubspot-hygiene-check`. No application code — the skill instructs Claude how to query HubSpot, process data, and render output.

**Tech Stack:** HubSpot CRM API via curl, markdown output to terminal.

---

### Task 1: Create the SKILL.md file

**Files:**
- Create: `plugins/pluginbrands-toolkit/skills/client-summary/SKILL.md`

**Step 1: Create the skill directory and file**

Write `plugins/pluginbrands-toolkit/skills/client-summary/SKILL.md` with the full content below.

The file must contain:

**Frontmatter:**
```yaml
---
name: client-summary
description: Use when asked to summarise a client, review a client's pipeline, or check how a client is doing. Triggers on phrases like "summarise MOJU", "how is Grind doing", "client summary for X", "review the pipeline for Y".
---
```

**Body sections (in order):**

#### Section 1: Title and prerequisite

```markdown
# Client Summary

Summarise a client's pipeline — buyer breakdown, deal stages, product pitch counts, and recent activity. Output is a structured terminal summary.

**Prerequisite:** The `hubspot-api-query` skill MUST be active. It provides object type IDs, pipeline stage mappings, and API patterns used throughout this workflow.
```

#### Section 2: Step 1 — Resolve the Client

Search Client Services (`0-162`) by name using `CONTAINS_TOKEN`. Include the exact API payload:

```
POST /crm/v3/objects/0-162/search
{
  "filterGroups": [{"filters": [{"propertyName": "hs_name", "operator": "CONTAINS_TOKEN", "value": "CLIENT_NAME"}]}],
  "properties": ["hs_name", "hs_pipeline_stage", "mrr", "hs_start_date", "hs_close_date", "hubspot_owner_id"],
  "limit": 10
}
```

Rules:
- If exactly one match → proceed
- If multiple matches → list them and ask user to pick
- If no match → stop with message "No Client Service found matching '{name}'"

Include the owner ID lookup table (same as hygiene-check):

| Name | Owner ID |
|------|----------|
| Danny Armstrong | `29590940` |
| Morgan West | `30525450` |
| Simon Greenwood-Haigh | `30585413` |
| Ollie Gough | `33030680` |
| Huw Roberts | `74984940` |
| Issy Kluk | `76825862` |
| Will Gatus | `78420301` |
| Mithil Ruparelia | `89049321` |
| Adam Priest | `115118133` |
| Charlie Knight | `118594265` |

Include the Client Service pipeline stage lookup instruction: `GET /crm/v3/pipelines/0-162` — fetch once and map the `hs_pipeline_stage` ID to its label.

#### Section 3: Step 1a — Ask operator breakdown preference

Before fetching pipeline data, ask the user:

> "Include per-team-member breakdown?" (Yes / No)

Store the answer for use in Step 6 (output rendering).

#### Section 4: Step 2 — Fetch all Brands

```
POST /crm/v3/objects/0-970/search
{
  "filterGroups": [{"filters": [{"propertyName": "client_name_sync", "operator": "EQ", "value": "CLIENT_NAME"}]}],
  "properties": ["hs_name", "buyer_name", "client_name_sync", "hs_pipeline_stage", "total_number_of_products", "count_of_closed_products", "hs_createdate", "hs_lastmodifieddate"],
  "limit": 100
}
```

Page through results if `paging.next` exists (use `after` cursor).

#### Section 5: Step 3 — Deduplicate Brands

No API call — local processing:

1. Extract `deal_id` from each Brand's `hs_name` using regex `\[(\d+)\]`
2. Group brands by `deal_id`
3. Per group, pick the record with the highest `total_number_of_products`
4. If all are `0`, pick the record with the earliest `hs_createdate`
5. Silently discard all other records in the group
6. Silently skip brands with no extractable deal ID

#### Section 6: Step 4 — Fetch Deal details

For each unique deal ID from Step 3:

```
GET /crm/v3/objects/deals/{dealId}?properties=dealname,dealstage,pipeline,hubspot_owner_id,hs_lastmodifieddate
```

If a deal returns 404 or error → silently skip it (orphaned brand).

Include the deal stage mapping table:

| Stage ID | Label |
|----------|-------|
| `4443390193` | Discovery |
| `4443390195` | Follow Up |
| `4443390196` | Feedback Pending |
| `4443390197` | Feedback Received |
| `4443390198` | Proposal |
| `4443390199` | Won |
| `4443390200` | No Response |
| `3774636266` | Lost |

Sort order for display (best to worst): Won → Proposal → Feedback Received → Feedback Pending → Follow Up → Discovery → No Response → Lost.

#### Section 7: Step 5 — Fetch Activity

For each deal:

```
GET /crm/v3/objects/deals/{dealId}/associations/meetings
GET /crm/v3/objects/deals/{dealId}/associations/notes
```

Collect all meeting and note IDs across all deals. Sort by recency. Take the 10 most recent and fetch their content:

```
GET /crm/v3/objects/meetings/{id}?properties=hs_meeting_title,hs_meeting_body,hs_meeting_start_time
GET /crm/v3/objects/notes/{id}?properties=hs_note_body,hs_createdate
```

For each, produce a one-line summary (~15 words) of the content. Associate each activity with its buyer/deal name.

#### Section 8: Step 6 — Render the Output

The output template, with and without operator breakdown. Include exact markdown formatting:

**Header:**
```
## {CLIENT} — Client Summary

MRR: £{mrr}/mo | Stage: {stage_label} | Started: {start_date} | Owner: {owner_name}
Buyers: {N} | Won: {N} | Proposal: {N} | Feedback Received: {N} | Discovery: {N} | Follow Up: {N} | Other: {N}
```

Only include stage counts that are >0 in the header line. Group No Response + Lost + Feedback Pending as "Other" if they have any entries.

**With operator breakdown (if user said Yes in Step 1a):**
```
---

### By Team Member
- {Name}: {N} buyers ({stage breakdown})
- ...
```

**Pipeline table:**
```
---

### Pipeline

| Buyer | Stage | Products | Last Activity |
|-------|-------|----------|---------------|
| ... | ... | ... | ... |
```

If operator breakdown is on, add an "Owner" column after "Stage".

Sorted by deal stage (Won first), then by last modified date within stage.

"Products" = `total_number_of_products` from the deduplicated Brand record.
"Last Activity" = `hs_lastmodifieddate` from the Deal, formatted as `DD Mon` (e.g. `27 Mar`).

**Activity section:**
```
---

### Recent Activity

- **{Buyer}** — Meeting ({date}): {one-line summary}
- **{Buyer}** — Note ({date}): {one-line summary}
- ...
```

If zero activities across all deals: show `No logged activity.`

Cap at 10 items, most recent first.

#### Section 9: Rate Limiting

Same as hygiene-check:
- HubSpot private app rate limit is 200 requests per 10 seconds
- Pause briefly between batches
- If you get a 429 response, wait 2 seconds and retry

#### Section 10: Important Notes

- This is a **read-only** skill. Do NOT update any records.
- Use **Deal stage** as the primary status indicator, not Brand stage (Brand stages are sometimes stale).
- The `products_placed` and `amount` rollup fields on Brands are **known broken** — ignore them.
- `buyer_name` on Brands is sometimes empty due to a workflow bug — fall back to parsing buyer name from `hs_name` (format: `CLIENT / BUYER [DEAL_ID]`).
- For meetings/notes, `hs_meeting_body` and `hs_note_body` may contain HTML. Strip tags and summarise the plain text content.

**Step 2: Verify the file exists**

Run: `ls plugins/pluginbrands-toolkit/skills/client-summary/SKILL.md`
Expected: File listed.

**Step 3: Commit**

```bash
git add plugins/pluginbrands-toolkit/skills/client-summary/SKILL.md
git commit -m "feat: add client-summary skill"
```

---

### Task 2: Register the skill in the plugin README

**Files:**
- Modify: `plugins/pluginbrands-toolkit/README.md`

**Step 1: Add to the Skills table**

In the skills table at the top, add a new row:

```
| client-summary | `Skill(pluginbrands-toolkit:client-summary)` | Summarises a client's pipeline — buyer breakdown, deal stages, product counts, and recent activity. |
```

**Step 2: Add a Usage section**

After the "### Generate Buyer Deck" section, add:

```markdown
### Client Summary

Run by asking:
- "Summarise MOJU"
- "How is Grind doing?"
- "Client summary for X"
- "Review the pipeline for Y"

Requires:
- `hubspot-api-query` skill (active)

Workflow:
1. Resolves client by name from Client Services
2. Asks whether to include per-team-member breakdown
3. Fetches brands, deduplicates, and resolves underlying deals
4. Fetches recent meetings and notes
5. Renders pipeline table and activity summary
```

**Step 3: Add skill permission to the Setup section**

In the permissions list, add:
```
"Skill(pluginbrands-toolkit:client-summary)"
```

**Step 4: Commit**

```bash
git add plugins/pluginbrands-toolkit/README.md
git commit -m "docs: register client-summary skill in plugin README"
```

---

### Task 3: Test against MOJU

**Step 1: Invoke the skill**

Run: `Skill(pluginbrands-toolkit:client-summary)` and ask it to summarise MOJU.

**Step 2: Verify output**

Check that the output:
- Shows MOJU header with MRR £45,000/mo
- Lists ~13-14 unique buyers (after dedup, minus orphaned itsu deal)
- Shows deal stages correctly (2 Won, 4 Proposal, etc.)
- Includes a Recent Activity section
- Sorts by stage then recency

**Step 3: Test operator breakdown**

Run again, this time choosing "Yes" for operator breakdown. Verify the "By Team Member" section appears with Danny, Adam, and Issy listed.

**Step 4: Fix any issues found and commit**

```bash
git add plugins/pluginbrands-toolkit/skills/client-summary/SKILL.md
git commit -m "fix: address issues found during client-summary testing"
```
