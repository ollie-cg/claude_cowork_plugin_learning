# Transport-Agnostic Skill Refactor

## Problem

The `hubspot-api-query` skill currently mixes domain knowledge (data model, object IDs, query logic, red flags) with transport mechanics (curl examples with Bearer token headers). This means:

- End users who have a HubSpot MCP connector get curl instructions they don't need
- The skill teaches both *what to query* and *how to make HTTP calls*, coupling two concerns
- The test harness relies on the skill for curl examples rather than owning its own transport layer

## Design

Separate domain knowledge from transport mechanics. The skill becomes transport-agnostic; the test harness owns curl instructions.

### Skill changes (`plugins/pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md`)

**Remove:** The entire "Curl Examples" section (current lines 116-146). Six curl examples deleted.

**Reword:** The Iron Law, from:

> NEVER query custom objects by name. ALWAYS use the numeric objectTypeId. NEVER explore the API — use the exact paths below.

To:

> NEVER query custom objects by name. ALWAYS use the numeric objectTypeId from the table below. NEVER explore the API — use the object IDs and query patterns in this skill.

**Keep unchanged:**
- Data model diagram
- Object Type IDs table (both objectTypeId and API path columns — the LLM uses whichever is relevant to its transport)
- Pipelines and stages
- How operators work
- Data quality issues
- Red Flags table
- Query recipes (already abstract, e.g. "Search Brand 0-970 where client_name_sync = client")
- Query checklist (mentions API operations like search and associations, but these describe *what* not *how*)

### Test harness changes (`test_harness.py`)

**Expand `build_system_prompt()`** to include generic curl templates in the base prompt. These are transport instructions that apply to all tiers (A/B/C/D).

The templates use `{objectTypeId}` placeholders rather than MOJU-specific examples:

```
## Curl Reference

# List objects with properties
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/{objectTypeId}?limit=100&properties=field1,field2"

# Search with filters
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/{objectTypeId}/search" \
  -d '{"filterGroups":[{"filters":[...]}],"properties":[...],"limit":100}'

# Get associations
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/{objectTypeId}/{recordId}/associations/{toObjectTypeId}"

# Get pipeline stages
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.hubapi.com/crm/v3/pipelines/{objectTypeId}"

# Get all properties for an object type
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.hubapi.com/crm/v3/properties/{objectTypeId}"
```

These go into both the Tier A/B base prompt and the Tier C/D base prompt, so curl transport is consistent across all tiers.

### Not changed

- Test results in `docs/test-results/` — historical, untouched
- System guide (`docs/hubspot-system-guide.md`) — separate concern
- Plugin metadata (`plugin.json`, `marketplace.json`)
- The 13 challenge prompts — test domain understanding, not transport
- Test harness structure beyond `build_system_prompt()`

## Files affected

| File | Change |
|------|--------|
| `plugins/pluginbrands-toolkit/skills/hubspot-api-query/SKILL.md` | Delete Curl Examples section, reword Iron Law |
| `test_harness.py` | Expand base prompts in `build_system_prompt()` with curl templates |

## Why this works

- The skill's value is in domain knowledge: object IDs, red flags, data quality warnings, query recipes. Tier D proved these drive the 4.7/5 scores, not the curl examples.
- MCP users get a clean skill that says "search Brand 0-970" and their MCP tools handle the rest.
- Curl users (test harness) get the same skill plus curl templates from the base prompt.
- No regression risk: the same information reaches the LLM, just from different sources.
