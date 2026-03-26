# HubSpot Hygiene Check — Design

## Purpose

An on-demand skill that checks the cleanliness of a person's HubSpot data. Scoped to a named owner, it walks the deal → brand → product pitch hierarchy and produces a report highlighting missing values, stale descriptions, and data quality issues.

Audience: operators (per-record action items) and management (summary rollup).

## Trigger

User says something like:
- "Check hygiene for Simon"
- "Run a cleanliness check for Issy"

The skill resolves the name to a `hubspot_owner_id` from the known owners table.

## Owners

| Name | Owner ID |
|------|----------|
| Danny Armstrong | 29590940 |
| Morgan West | 30525450 |
| Simon Greenwood-Haigh | 30585413 |
| Ollie Gough | 33030680 |
| Huw Roberts | 74984940 |
| Issy Kluk | 76825862 |
| Will Gatus | 78420301 |
| Mithil Ruparelia | 89049321 |
| Adam Priest | 115118133 |
| Charlie Knight | 118594265 |

## Fetch Sequence

1. Search deals where `hubspot_owner_id` = owner ID
2. For each deal: fetch associations to companies, contacts, brands (0-970)
3. For each brand: fetch associations to product pitches (0-420)
4. For each deal: fetch associated notes, emails, meetings (for description check)

## Rules

### Deal-level

| Rule | Check |
|------|-------|
| Has deal value | `amount` is not null/empty |
| Has close date | `closedate` is not null/empty |
| Associated to company | Deal → company associations, expect >= 1 |
| Has contacts | Deal → contact associations, expect >= 1 |
| Has a brand | Deal → brand (0-970) associations, expect >= 1 |

### Brand-level (for each brand on the deal)

| Rule | Check |
|------|-------|
| Has status | `hs_status` is not null/empty |
| Description reflects activity | If `hs_description` is empty and activities exist on the deal → flag "missing". If description exists, compare against associated notes/emails/meetings content — flag "stale" if recent activity is not reflected. AI-judged comparison. |

### Product Pitch-level (for each pitch on the brand)

| Rule | Check |
|------|-------|
| Has price | `hs_price` is not null/empty |
| Name is standardised | `hs_name` matches pattern: `{Product} / {Buyer} - {Client} [{id}]`. Flag malformed names. |
| Has decline reason | Only when stage = Declined: `reason` must not be null/empty |

## Report Format

```
# Hygiene Report: {Owner Name}
## {N} deals checked | {N} brands | {N} pitches
## {N} issues found

---

### {Deal Name} (Deal)
- ✗ {issue description}

  #### {Brand Name} (Brand)
  - ✗ {issue description}

  ##### {Pitch Name} (Pitch)
  - ✗ {issue description}

---

## Summary
| Level | Records | Clean | Issues |
|-------|---------|-------|--------|
| Deals | N | N | N |
| Brands | N | N | N |
| Pitches | N | N | N |

Top issues:
- {aggregated issue counts}
```

Clean records show a single "Clean" line. The summary table at the bottom serves as the management view.

## Implementation

Single skill file at `plugins/pluginbrands-toolkit/skills/hubspot-hygiene-check/SKILL.md`.

The skill is a prompt that teaches Claude the fetch sequence, rules, and report format. It depends on `hubspot-api-query` for object type IDs, pipeline stage mappings, and API patterns. No scripts or database — purely a skill prompt using the existing curl-based API pattern.
