---
name: client-summary
description: Use when asked to summarise a client, review a client's pipeline, or check how a client is doing. Triggers on phrases like "summarise MOJU", "how is Grind doing", "client summary for X", "review the pipeline for Y".
---

# Client Summary

Summarise a client's pipeline — buyer breakdown, deal stages, product pitch counts, and recent activity. Output is a structured terminal summary.

**Prerequisite:** The `hubspot-api-query` skill MUST be active. It provides object type IDs, pipeline stage mappings, and API patterns used throughout this workflow.

## Step 1: Resolve the Client

Search Client Services (`0-162`) by name:

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

Fetch Client Service pipeline stages once to map the `hs_pipeline_stage` ID to its label:

```
GET /crm/v3/pipelines/0-162
```

Match the owner ID to a name:

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

### Step 1a: Ask Operator Breakdown Preference

Before fetching pipeline data, ask the user:

> "Include per-team-member breakdown?" (Yes / No)

Store the answer for use in output rendering.

## Step 2: Fetch all Brands

```
POST /crm/v3/objects/0-970/search
{
  "filterGroups": [{"filters": [{"propertyName": "client_name_sync", "operator": "EQ", "value": "CLIENT_NAME"}]}],
  "properties": ["hs_name", "buyer_name", "client_name_sync", "hs_pipeline_stage", "total_number_of_products", "count_of_closed_products", "hs_createdate", "hs_lastmodifieddate"],
  "limit": 100
}
```

Page through results if `paging.next` exists. Pass the `after` value as an integer in the request body: `"after": 100` (not a string — HubSpot search pagination requires an integer).

## Step 3: Deduplicate Brands

No API call — local processing:

1. Extract `deal_id` from each Brand's `hs_name` using regex `\[(\d+)\]`
2. Group brands by `deal_id`
3. Per group, pick the record with the highest `total_number_of_products`
4. If all are `0`, pick the record with the earliest `hs_createdate`
5. Silently discard all other records in the group
6. Silently skip brands with no extractable deal ID

## Step 4: Fetch Deal Details

For each unique deal ID:

```
GET /crm/v3/objects/deals/{dealId}?properties=dealname,dealstage,pipeline,hubspot_owner_id,hs_lastmodifieddate
```

If a deal returns 404 or error → silently skip it (orphaned brand).

Map deal stage IDs to labels:

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

## Step 5: Fetch Activity

For each deal:

```
GET /crm/v3/objects/deals/{dealId}/associations/meetings
GET /crm/v3/objects/deals/{dealId}/associations/notes
```

Collect all meeting and note IDs across all deals. The association endpoints return IDs only (no timestamps), so fetch all records first, then sort.

Use batch reads for efficiency:

```
POST /crm/v3/objects/meetings/batch/read
{ "inputs": [{"id": "ID1"}, {"id": "ID2"}, ...], "properties": ["hs_meeting_title", "hs_meeting_body", "hs_meeting_start_time"] }

POST /crm/v3/objects/notes/batch/read
{ "inputs": [{"id": "ID1"}, {"id": "ID2"}, ...], "properties": ["hs_note_body", "hs_createdate"] }
```

Sort all results by `hs_meeting_start_time` / `hs_createdate` descending. Take the 10 most recent. For each, produce a one-line summary (~15 words) of the content. Associate each activity with its buyer/deal name.

## Step 6: Render the Output

Output the report in this format:

**Header:**
```
## {CLIENT} — Client Summary

MRR: £{mrr}/mo | Stage: {stage_label} | Started: {start_date} | Owner: {owner_name}
Buyers: {N} | Won: {N} | Proposal: {N} | Feedback Received: {N} | Discovery: {N} | Follow Up: {N} | Other: {N}
```

Only include stage counts that are >0. Group No Response + Lost + Feedback Pending as "Other" if present.

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
"Last Activity" = `hs_lastmodifieddate` from the Deal, formatted as `DD Mon`.

**Activity section:**
```
---

### Recent Activity

- **{Buyer}** — Meeting ({date}): {one-line summary}
- **{Buyer}** — Note ({date}): {one-line summary}
- ...
```

If zero activities: show `No logged activity.`

Cap at 10 items, most recent first.

## Rate Limiting

HubSpot private app rate limit is 200 requests per 10 seconds. If the client has many buyers, you will make a lot of API calls. To stay within limits:

- Pause briefly between batches of association lookups
- If you get a 429 response, wait 2 seconds and retry
- Process deals in batches of 10-20 at a time

## Important Notes

- This is a **read-only** skill. Do NOT update any records.
- Use **Deal stage** as the primary status indicator, not Brand stage (Brand stages are sometimes stale).
- The `products_placed` and `amount` rollup fields on Brands are **known broken** — ignore them.
- `buyer_name` on Brands is sometimes empty due to a workflow bug — fall back to parsing buyer name from `hs_name` (format: `CLIENT / BUYER [DEAL_ID]`).
- For meetings/notes, `hs_meeting_body` and `hs_note_body` may contain HTML. Strip tags and summarise the plain text content.
