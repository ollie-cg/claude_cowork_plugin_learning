---
name: hubspot-hygiene-check
description: Use when asked to check data cleanliness, hygiene, or quality for a person's HubSpot records. Triggers on phrases like "check hygiene for Simon", "run a cleanliness check", "how clean is Issy's data".
---

# HubSpot Hygiene Check

Run a data cleanliness audit for a named person's deals, brands, and product pitches. Produces a per-record issue list for operators and a summary rollup for management.

**Prerequisite:** The `hubspot-api-query` skill MUST be active. It provides object type IDs, pipeline stage mappings, and API patterns used throughout this workflow.

## Step 1: Resolve the Owner

Match the name the user provides to an owner ID. Use fuzzy matching (first name is enough).

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

If the name doesn't match anyone, ask the user to clarify.

## Step 2: Fetch the Data

Execute these API calls in sequence. Use the HubSpot API token and patterns from `hubspot-api-query`.

### 2a. Get all deals for the owner

```
POST /crm/v3/objects/deals/search
{
  "filterGroups": [{"filters": [{"propertyName": "hubspot_owner_id", "operator": "EQ", "value": "OWNER_ID"}]}],
  "properties": ["dealname", "amount", "closedate", "dealstage", "pipeline", "hubspot_owner_id"],
  "limit": 100
}
```

Page through results if `paging.next` exists. Collect all deal IDs.

**Filter out legacy pipelines.** Only check deals in:
- Buyer Deal Pipeline: `2760762586`
- Client Deal Pipeline: `2760762585`

Skip deals in any other pipeline (legacy client-named pipelines are superseded).

### 2b. For each deal, fetch associations

Make these calls for every deal:

```
GET /crm/v3/objects/deals/{dealId}/associations/companies
GET /crm/v3/objects/deals/{dealId}/associations/contacts
GET /crm/v3/objects/deals/{dealId}/associations/0-970
```

Record which deals have companies, contacts, and brands.

### 2c. For each brand, fetch properties and pitch associations

```
GET /crm/v3/objects/0-970/{brandId}?properties=hs_name,buyer_name,client_name_sync,hs_pipeline_stage,hs_status,hs_description,hs_lastmodifieddate
GET /crm/v3/objects/0-970/{brandId}/associations/0-420
```

### 2d. For each product pitch, fetch properties

Batch where possible. For each pitch:

```
GET /crm/v3/objects/0-420/{pitchId}?properties=hs_name,client_name_sync,hs_pipeline_stage,hs_price,amount,reason
```

### 2e. For each deal, fetch activity for description check

Fetch notes and meetings associated to the deal. Emails are blocked by API scope, so skip those.

```
GET /crm/v3/objects/deals/{dealId}/associations/notes
GET /crm/v3/objects/deals/{dealId}/associations/meetings
```

For each note found, fetch its content:
```
GET /crm/v3/objects/notes/{noteId}?properties=hs_note_body,hs_createdate
```

For each meeting found, fetch its content:
```
GET /crm/v3/objects/meetings/{meetingId}?properties=hs_meeting_title,hs_meeting_body,hs_meeting_start_time
```

## Step 3: Apply Rules

Check every record against these rules. Track issues per record.

### Deal Rules

| # | Rule | Check | Issue text |
|---|------|-------|------------|
| D1 | Has deal value | `amount` is not null and not empty | "Missing deal value" |
| D2 | Has close date | `closedate` is not null and not empty | "Missing close date" |
| D3 | Associated to company | Company associations >= 1 | "No company associated" |
| D4 | Has contacts | Contact associations >= 1 | "No contacts associated" |
| D5 | Has a brand | Brand (0-970) associations >= 1 | "No brand associated" |

### Brand Rules

| # | Rule | Check | Issue text |
|---|------|-------|------------|
| B1 | Has status | `hs_status` is not null and not empty | "Missing status" |
| B2 | Description reflects activity | See description check logic below | Variable — see below |

**Description check logic (B2):**

1. If `hs_description` is empty/null AND the deal has notes or meetings → issue: "Description is empty — {N} notes and {N} meetings exist on the deal"
2. If `hs_description` is empty/null AND the deal has NO notes or meetings → issue: "Description is empty (no activity logged either)"
3. If `hs_description` has content → compare it against the notes and meeting content fetched in Step 2e. Use your judgement:
   - Does the description roughly cover the key points from the activity?
   - Are there significant recent activities (notes/meetings) that aren't reflected?
   - If the description looks stale or incomplete → issue: "Description may be stale — {N} notes/meetings logged since last update, key topics not reflected: {brief summary of what's missing}"
   - If the description reasonably reflects the activity → no issue (clean)

### Product Pitch Rules

| # | Rule | Check | Issue text |
|---|------|-------|------------|
| P1 | Has price | `hs_price` is not null and not empty | "Missing price" |
| P2 | Name is standardised | `hs_name` matches pattern `{Product} / {Buyer} - {Client} [{id}]`. All four components must be non-empty. Flag names like ` / - [id]` or with missing components. | "Malformed name: {actual name}" |
| P3 | Has decline reason | Only when `hs_pipeline_stage` = `4549842109` (Declined): `reason` must not be null/empty | "Declined but no reason given" |

## Step 4: Render the Report

Output the report in this exact format:

```
# Hygiene Report: {Owner Name}
## {N} deals checked | {N} brands | {N} pitches
## {N} issues found

---
```

Then for each deal (only show deals that have issues OR contain brands/pitches with issues):

```
### {Deal Name} (Deal)
- ✗ {issue}
- ✗ {issue}

  #### {Brand Name} (Brand)
  - ✗ {issue}

  ##### {Pitch Name} (Pitch)
  - ✗ {issue}
```

For records with no issues within an otherwise-flagged deal, show:
```
  #### {Brand Name} (Brand)
  - Clean
```

**Do NOT list fully clean deals** (where the deal and all its brands and pitches pass every check). They clutter the report. Only mention them in the summary count.

End with the summary:

```
---

## Summary
| Level | Records | Clean | Issues |
|-------|---------|-------|--------|
| Deals | {N} | {N} | {N} |
| Brands | {N} | {N} | {N} |
| Pitches | {N} | {N} | {N} |

Top issues:
- {N}x {issue description}
- {N}x {issue description}
- ...
```

Sort "Top issues" by count descending. Group similar issues (e.g. "8x Missing status" not 8 separate lines).

## Rate Limiting

HubSpot private app rate limit is 200 requests per 10 seconds. If the person has many deals, you will make a lot of API calls. To stay within limits:

- Pause briefly between batches of association lookups
- If you get a 429 response, wait 2 seconds and retry
- Process deals in batches of 10-20 at a time

## Important Notes

- This is a **read-only** check. Do NOT update any records.
- The `products_placed` and `amount` rollup fields on Brands are **known broken** — do NOT flag them as issues. They are excluded from the rules deliberately.
- `buyer_name` on Brands is auto-populated by workflow and sometimes empty due to a workflow bug — do NOT flag it as an issue.
- The description check (B2) requires judgement. Err on the side of flagging — it's better to surface a potentially stale description than to miss it.
- If a deal has a very large number of pitches (100+), summarise pitch issues rather than listing every single one (e.g. "47 of 221 pitches missing price").
