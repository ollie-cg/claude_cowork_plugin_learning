# Client Summary Skill — Design

**Date:** 2026-03-27
**Based on:** `docs/plans/2026-03-27-client-summary-learnings.md`

---

## Purpose

A skill that summarises how a client is doing — pipeline status, buyer breakdown, and recent activity — triggered by client name, output to terminal.

Designed for internal use now, with a path to client-facing output later.

## Trigger

Invoked as `client-summary`. User provides a client name (e.g. "summarise MOJU").

### Input resolution

1. Search Client Services (`0-162`) by name using `CONTAINS_TOKEN`
2. Exactly one match → proceed
3. Multiple matches → list them, ask user to pick
4. No match → stop with message

### Runtime prompt

Before fetching pipeline data, the skill asks:

> "Include per-team-member breakdown?" (Yes / No)

Controls whether output groups buyers by operator or lists them flat.

---

## Query Sequence

### Step 1: Fetch Client Service

```
POST /crm/v3/objects/0-162/search
Filter: hs_name CONTAINS_TOKEN "<client_name>"
Properties: hs_name, hs_pipeline_stage, mrr, hs_start_date, hs_close_date, hubspot_owner_id
```

### Step 2: Fetch all Brands

```
POST /crm/v3/objects/0-970/search
Filter: client_name_sync EQ "<client_name>"
Properties: hs_name, buyer_name, client_name_sync, hs_pipeline_stage,
            total_number_of_products, count_of_closed_products,
            hs_createdate, hs_lastmodifieddate
Limit: 100 (paginate with `after` if needed)
```

### Step 3: Deduplicate Brands

No API call — local processing:

1. Extract `deal_id` from `hs_name` using regex `\[(\d+)\]`
2. Group brands by `deal_id`
3. Per group, pick the record with highest `total_number_of_products`
4. If all zero, pick earliest `hs_createdate` (the original)
5. Silently skip brands with no deal ID in name

### Step 4: Fetch Deal details

```
GET /crm/v3/objects/deals/{dealId}?properties=dealname,dealstage,pipeline,hubspot_owner_id,hs_lastmodifieddate
```

One call per unique deal ID. Silently skip deals that return 404 (orphaned brands).

### Step 5: Fetch activity associations

```
GET /crm/v3/objects/deals/{dealId}/associations/meetings
GET /crm/v3/objects/deals/{dealId}/associations/notes
```

Two calls per deal.

### Step 6: Fetch activity content

For each associated meeting/note, fetch the record to get body text:

```
GET /crm/v3/objects/meetings/{id}?properties=hs_meeting_title,hs_meeting_body,hs_meeting_start_time
GET /crm/v3/objects/notes/{id}?properties=hs_note_body,hs_createdate
```

Cap at the 10 most recent activities across all deals.

### API call estimate

For a client like MOJU (14 buyers, ~4 activities):
- 1 (client search) + 2 (brands, paginated) + 14 (deals) + 28 (activity associations) + ~4 (activity content) = **~49 calls**

---

## Stage ID Lookup Tables

### Client Service Pipeline Stages

Query via `GET /crm/v3/pipelines/0-162` at runtime (stage IDs not fully documented).

### Deal Stages (Buyer Deal Pipeline)

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

### Owner IDs

| ID | Name |
|----|------|
| `29590940` | Danny Armstrong |
| `30525450` | Morgan West |
| `30585413` | Simon Greenwood-Haigh |
| `33030680` | Ollie Gough |
| `74984940` | Huw Roberts |
| `76825862` | Issy Kluk |
| `78420301` | Will Gatus |
| `89049321` | Mithil Ruparelia |
| `115118133` | Adam Priest |
| `118594265` | Charlie Knight |

---

## Output Format

### Default (no operator breakdown)

```
## MOJU — Client Summary

MRR: £45,000/mo | Stage: Active | Started: Jan 2026 | Owner: Adam Priest
Buyers: 14 | Won: 2 | Proposal: 4 | Feedback Received: 3 | Discovery: 2 | Follow Up: 1 | Other: 2

---

### Pipeline

| Buyer                    | Stage             | Products | Last Activity |
|--------------------------|-------------------|----------|---------------|
| University of Nottingham | Won               | 8        | 20 Mar        |
| goodnus                  | Won               | 5        | 26 Mar        |
| Office Pantry            | Proposal          | 6        | 19 Mar        |
| ...                      | ...               | ...      | ...           |

### Recent Activity

- **CBRE (Baxterstorey)** — Meeting (27 Mar): Discussed revised pricing for Q2 launch...
- **Kauai** — Meeting (25 Mar): Tasting session scheduled for April...
- **Kauai** — Meeting (20 Mar): Initial intro call with procurement...
```

### With operator breakdown

The pipeline table gains an "Owner" column, and a grouped summary appears at the top:

```
### By Team Member
- Danny Armstrong: 8 buyers (2 Won, 4 Proposal, 1 Feedback Received, 1 Discovery)
- Adam Priest: 3 buyers (1 Proposal, 1 Feedback Received, 1 Follow Up)
- Issy Kluk: 2 buyers (1 Discovery, 1 Follow Up)
```

### Sorting

Buyers sorted by deal stage (Won first → Lost last), then by last modified date within each stage.

### Activity summarisation

Each meeting/note summarised in one line (~15 words), most recent first, capped at last 10 activities across all deals. If zero activity: "No logged activity."

---

## Edge Cases

| Case | Handling |
|------|----------|
| Multiple client name matches | List matches, prompt user to pick |
| No client match | Stop with message |
| Deleted deal (orphaned brand) | Silently skip |
| Brand with no deal ID in name | Silently skip |
| Zero activity | Show "No logged activity" |
| >100 brands | Paginate with `after` cursor |
| All brands have 0 products (early stage) | Pick earliest created as canonical |

---

## Skill Location

```
plugins/pluginbrands-toolkit/skills/client-summary/SKILL.md
```

Reuses HubSpot API token and base URL from the existing `hubspot-api-query` skill. No new configuration needed.

---

## Future

- Client-facing output format (slide deck via Gamma, or polished markdown/PDF)
- Trend data (compare current pipeline to last month)
- Automated scheduling (weekly client health reports)
