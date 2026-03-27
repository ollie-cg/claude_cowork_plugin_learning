# LLM Scaffolding Framework Learnings

What works when building systems that familiarise an LLM with a specific domain and constrain its behaviour to produce reliable outputs.

---

## The core problem

LLMs default to plausible-sounding output. Without scaffolding, they:

- Act before thinking (tool availability biases toward action over reasoning)
- Skip verification (claim success without evidence)
- Rationalise shortcuts ("this is simple enough to skip the process")
- Lose context in long sessions (early instructions decay)
- Hallucinate domain-specific details when knowledge is thin

A scaffolding framework is structured instructions + workflows + verification gates that counteract these defaults.

---

## Key concepts

### 1. Scaffolding vs harness

Two distinct layers, often conflated:

| Layer | When | What it does |
|-------|------|-------------|
| **Scaffold** | Before first prompt | Assembles the agent: system prompt, tool schemas, skill metadata, domain context |
| **Harness** | At runtime | Orchestrates tool dispatch, context management, safety enforcement, human checkpoints |

Keep them separate. Construction-time concerns (what the LLM knows) shouldn't entangle with runtime concerns (what the LLM does).

### 2. Skills as the unit of behaviour

A **skill** is a self-contained instruction set that activates in response to a specific trigger. Not a reference document. Not a knowledge dump. A workflow the LLM follows.

Anatomy of a well-structured skill (from Superpowers):

```
Frontmatter:   name + trigger description (when to use, not what it does)
               Max ~1024 chars, 2 fields only

Body:          < 500 words (< 150 for bootstrapping skills)
               Iron Law (one non-negotiable constraint)
               Red Flags table (preempt rationalisations)
               Checklist (ordered steps, each becomes a tracked todo)
               Verification criteria (how to prove completion)
```

### 3. Two-phase loading

Load skill **metadata** at startup (name + trigger condition). Load full skill content only when triggered. This keeps baseline token cost low while preserving comprehensive guidance when needed.

### 4. Context is a budget, not a bin

Context windows are finite and expensive. Treat them as managed resources:

- **Graduated compaction** — progressive stages (70%, 80%, 90%, 95%, 99%) from warnings through observation masking to full summarisation, rather than binary overflow
- **Dual memory** — compressed long-range context (LLM summary of full history) alongside detailed short-range context (recent messages verbatim)
- **Offload large outputs** — write to files, keep brief previews in context, retrieve on demand
- **Conditional sections** — only include instructions relevant to the current state (no git workflow rules in non-repos)

---

## What works: patterns that improve LLM reliability

### Iron Laws

A single, absolute constraint per failure mode. No exceptions, no "use your judgement."

Examples from Superpowers:
- TDD: *"NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST"*
- Verification: *"NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"*
- Debugging: *"NO FIX PROPOSALS BEFORE COMPLETING PHASE 1 INVESTIGATION"*

Why they work: LLMs respond well to bright-line rules. Fuzzy guidance ("try to write tests") gets optimised away under pressure. Absolute rules don't.

### Red Flags tables

Explicitly list the rationalisations the LLM will generate, paired with corrections:

| Thought | Reality |
|---------|---------|
| "This is simple enough to skip" | Simple tasks are where assumptions cause waste |
| "I'll test after" | Tests written after pass immediately, proving nothing |
| "I already know what to do" | Knowing the concept != following the process |

Why they work: LLMs can recognise their own patterns when shown them. Without this, the same escape routes get used every session.

### Sequential gates with human checkpoints

Force a pipeline where each phase produces an artifact the human can approve:

```
Brainstorm → Design Doc → Plan → Implementation → Verification → Review
```

Each gate is explicit: "Present this to the user. Do not proceed until approved." Prevents the LLM from sprinting through a plan nobody agreed to.

### Separation of thinking and action

When tools are available, LLMs act quickly rather than think deeply. Providing a tool-free thinking phase produces substantially better reasoning. Configurable depth (off/low/medium/high) lets users balance speed against deliberation.

### System reminders at decision points

Short, targeted reminders injected at maximum recency (close to the current message) are more effective than distant system prompt sections. Fire them at decision points — before commits, before completion claims, before tool use.

### Schema-level safety

Making dangerous tools invisible is more robust than runtime permission checks. The model can't reason about capabilities it never sees. This is fundamentally more reliable than "you can use this tool but check permissions first."

### Checklists with todo tracking

When a skill has ordered steps, each step becomes a tracked todo item. This:
- Makes progress visible to the human
- Prevents the LLM from skipping steps
- Creates natural checkpoints for course correction

---

## What doesn't work

### Knowledge dumps

Giving the LLM a reference document and saying "use this" doesn't reliably change behaviour. Information != instruction. The LLM will read it, say it understands, then revert to defaults.

Phase 2 testing confirmed this directly: a 17,800-char system guide (Tier B) scored 2.3/5 average. An 8,920-char skill (Tier D) scored ~4.7/5. Half the tokens, triple the effectiveness — because the skill is a workflow, not a reference.

### Vague guidance

"Try to follow best practices" or "be thorough" gets interpreted however the LLM finds convenient. Constraints must be specific, observable, and binary (did you or didn't you).

### One-shot prompting for complex workflows

A single system prompt trying to cover everything results in early instructions decaying as context grows. Skills that activate on-demand keep instructions fresh and proximate.

### Trusting self-assessment

LLMs will confidently report "all tests pass" without running them, or "the code is correct" without verification. Always require executed evidence, never accept claims.

### Over-abstraction

Premature abstraction in skills is as harmful as in code. Write skills for observed failure modes, not hypothetical ones. If you haven't watched the LLM fail at something, you don't know what the skill should teach.

---

## The meta-practice: test skills like code

The most important pattern from Superpowers' `writing-skills` skill:

> *"If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing."*

The process mirrors TDD:

1. **RED** — Run a scenario without the skill. Watch the LLM fail. Document what went wrong.
2. **GREEN** — Write minimal skill content that addresses the specific failure.
3. **REFACTOR** — Find new rationalisations the LLM generates to escape the skill. Plug the loopholes. Repeat.

Three skill types need different testing approaches:

| Type | Test approach | Example |
|------|--------------|---------|
| Discipline-enforcing | Test under maximum pressure (tight deadlines, "just do it" prompts) | TDD, verification |
| Technique-based | Verify application to novel scenarios | Debugging, brainstorming |
| Pattern-focused | Confirm recognition and proper application | Domain conventions |

---

## Architecture summary

```
Session Start
    │
    ├── Load metadata index (skill names + triggers)
    ├── Load domain context (system guide, data model)
    └── Bootstrap skill (routing table, red flags)
         │
         ▼
    User Message
         │
         ├── Check skill triggers → Load full skill on match
         ├── Create todo checklist from skill steps
         ├── Follow skill workflow
         │     ├── Human gate (approval before proceeding)
         │     ├── Verification gate (run command, read output)
         │     └── Completion gate (evidence before claims)
         └── Mark todos complete as work progresses
```

---

## Phase 1 baseline results (2026-03-20)

Ran 13 challenge prompts across Tier A (raw LLM) and Tier B (with system guide). Model: Opus. Each test spawned an isolated `claude` process with only Bash/curl available.

### Tier A: raw LLM with no domain context

**10/13 completed, 3 timed out.**

The LLM never discovered any of the four custom objects (Brand, Product Pitch, Client Product, Client Service). It worked exclusively with standard HubSpot entities — Companies, Contacts, Deals — and legacy deal pipelines.

Key failure patterns:

| Pattern | Tests affected | Detail |
|---------|---------------|--------|
| Never found Brand object | 7/13 | Used Deals or `brands_listed_in_customer` free-text field instead |
| Never found Product Pitch | 4/13 | Counted deals as "pitches" |
| Never found Client Product | 1/13 | Found empty standard Products object, missed the 157-record custom object |
| Never found Client Service | 2/13 | Described generic CRM onboarding, missed contract lifecycle |
| No data quality caveats | 2/13 | Reported numbers without flagging known gaps |
| Timeout | 3/13 | Exhausted 300s searching without finding the right path |

One bright spot: **C3** (contacts at won buyers) was answered correctly using only standard Deals → Companies → Contacts — the one question that didn't require custom objects.

### Tier B: system guide loaded

**9/13 completed, 4 timed out.**

The guide eliminated all entity confusion. Every completed test correctly identified which custom object to query. But a new dominant failure emerged.

Key changes from A → B:

| Pattern | Tier A | Tier B | Change |
|---------|--------|--------|--------|
| Entity confusion | 7/13 | **0/13** | Eliminated — guide works |
| Can't access custom objects via API | 0/13 | **6/13** | New blocker |
| Data quality not flagged | 2/13 | **0/13** | Eliminated — guide's DQ section works |
| Timeouts | 3/13 | 4/13 | Slightly worse |

### The custom object API gap

The dominant Tier B failure: the LLM knew exactly which entity to query (Brand, Product Pitch, etc.) but couldn't access them via the HubSpot API. It tried names like `brand`, `client_service`, `product_pitch` and got "Invalid object or event type id" errors. It concluded the token lacked permissions.

The real issue is twofold:

1. **HubSpot custom objects require numeric `objectTypeId` values** (e.g., `2-XXXXX`), not their human-readable names. The system guide doesn't include these IDs.
2. **The PAT token's scopes may not include `crm.objects.custom.read`** — even the `/crm/v3/schemas` endpoint returned auth errors with the PAT, suggesting custom object schema access requires OAuth or additional scopes.

This means the system guide successfully teaches *what* to query but doesn't enable *how* to query it. The highest-value Phase 2 skill would provide the custom object type IDs and correct API paths.

### What the system guide does well

- **B2** (buyer pitch setup) was answered perfectly in 1 turn, 32 seconds, zero API calls. The guide alone provided everything needed.
- **A3** (Deal vs Brand) went from "Brand doesn't exist" (Tier A) to a correct hierarchy diagram with example records (Tier B).
- **D3** (meeting count) went from a bare number to flagging the association gap — the data quality section drives real behaviour change.

### What the system guide doesn't address

1. **Custom object API mechanics** — no objectTypeIds, no example curl commands for custom objects
2. **Legacy pipeline mapping** — the LLM falls back to `[D] Moju` and other legacy pipelines because they're accessible; guide doesn't say "prefer Brand over legacy pipelines"
3. **Timeout management** — LLM spends 40+ turns probing API endpoints; no guidance on efficient discovery patterns

### Implications for Phase 2

| Priority | Skill | Why |
|----------|-------|-----|
| 1 | `hubspot-api-reference` | Provide objectTypeIds and working curl examples for all custom objects. Unblocks 6/13 Tier B failures. |
| 2 | `hubspot-data-quality` | Reinforce the broken fields as Iron Laws (not just documentation). Prevents trusting `products_placed`, `amount`. |
| 3 | `hubspot-query-patterns` | Canonical multi-step recipes. Prevents timeout loops from exploratory API probing. |

---

## Phase 2 results: skill-driven querying (2026-03-20)

Built a single `hubspot-api-query` skill and tested it in two configurations:

- **Tier C** — enhanced base prompt + system guide + skill (20,760 chars)
- **Tier D** — enhanced base prompt + skill only, no system guide (9,600 chars)

The skill was designed following the patterns above: Iron Law, Red Flags table, ordered checklist, canonical curl examples, and — critically — the data model, pipeline stages, operator workflow, and known data quality issues baked directly into the skill body.

### Tier C: system guide + skill

**13/13 completed, 0 timeouts.** Estimated average: ~4.6/5.

Every test that failed in Tier A and B now succeeded. Custom objects were queried correctly using numeric objectTypeIds. Data quality issues were flagged in every response. No test fell back to legacy pipelines.

### Tier D: skill only, no system guide

**13/13 completed, 0 timeouts.** Estimated average: ~4.7/5.

Tier D matched or slightly exceeded Tier C on every test — with less than half the context.

### Score progression across all four tiers

| Test | Category | A | B | C | D |
|------|----------|---|---|---|---|
| A1 | Data Model | 2 | 2 | ~5 | ~5 |
| A2 | Data Model | 0* | 0* | ~4 | ~4 |
| A3 | Data Model | 1 | 4 | ~5 | ~5 |
| A4 | Data Model | 1 | 3 | ~5 | ~5 |
| A5 | Data Model | 2 | 0* | ~4 | ~4 |
| B1 | Workflow | 1 | 3 | ~5 | ~5 |
| B2 | Workflow | 2 | 5 | ~5 | ~5 |
| C1 | Query | 2 | 0* | ~5 | ~5 |
| C2 | Query | 1 | 0* | ~4 | ~4 |
| C3 | Query | 4 | 5 | ~4 | ~5 |
| D1 | Data Quality | 0* | 3 | ~5 | ~5 |
| D2 | Data Quality | 0* | 0* | ~5 | ~5 |
| D3 | Data Quality | 3 | 4 | ~4 | ~4 |

*\* = timeout (counted as 0)*

| Metric | Tier A | Tier B | Tier C | Tier D |
|--------|--------|--------|--------|--------|
| Context size | 426 chars | 18,200 chars | 20,760 chars | **9,600 chars** |
| Completed | 10/13 | 9/13 | 13/13 | **13/13** |
| Timeouts | 3 | 4 | 0 | **0** |
| Avg score (est) | 1.5 | 2.3 | ~4.6 | **~4.7** |
| Entity confusion | 7/13 | 0/13 | 0/13 | 0/13 |
| Custom object access blocked | — | 6/13 | 0/13 | **0/13** |
| Data quality flagged | 2/13 | ~8/13 | 13/13 | **13/13** |

### What Tier D proves

**A well-crafted skill can replace the system guide entirely for query tasks — at half the token cost.**

The system guide is a 17,800-char reference document. The skill is 8,920 chars of workflow-oriented instruction. The LLM follows skills more reliably than it extracts patterns from reference docs, because:

1. **Skills are workflows, not knowledge.** The skill says "do this, then this, then this." The guide says "here's what exists." The LLM needs the former.
2. **Red Flags tables pre-empt rationalisation.** The skill explicitly lists the seven thoughts that cause failure and corrects them inline. The guide has no such mechanism.
3. **Query recipes eliminate exploration.** The skill provides exact multi-step recipes for common questions. The guide leaves the LLM to work out query paths from entity descriptions — causing the timeout loops seen in Tier B.
4. **Iron Laws hold under pressure.** "NEVER query custom objects by name" is a bright-line rule. The guide's equivalent ("these are repurposed native types") is descriptive, not prescriptive.
5. **Context efficiency matters.** Less context means higher salience for the instructions that are present. The guide's sections on associations, daily workflows, and pipeline stages compete for attention with the critical API mechanics.

### Specific improvements in Tier D vs C

- **C3** (contacts at won buyers): 154s/13 turns vs 262s/60 turns in Tier C. The query recipe in the skill provided a direct path.
- **B1** (client onboarding): showed MRR ranges (£2,500–£45,000), all 19 clients with stage distribution — more thorough than C despite less context.
- **A4** (nutritional data): found a populated example from another client to show what complete data looks like, not just MOJU's empty fields.

### What this means for the plugin

The skill alone is sufficient for the plugin's CLAUDE.md or skill loading mechanism. The system guide remains valuable as a human reference document and for non-query tasks (e.g., explaining business processes to new team members), but for LLM-driven HubSpot queries, the skill is the better delivery format.

The three separate Phase 2 skills originally planned (`hubspot-api-reference`, `hubspot-data-quality`, `hubspot-query-patterns`) were consolidated into one `hubspot-api-query` skill. This works because the failure modes they address are not independent — the LLM needs the objectTypeIds, the data quality warnings, and the query recipes together in a single workflow context.

---

## Phase 3: transport-agnostic skill refactor (2026-03-23)

Separated domain knowledge from transport mechanics in the `hubspot-api-query` skill to support both curl-based testing and future MCP connector usage.

**Problem:** The skill mixed two concerns — domain knowledge (data model, object IDs, query logic, red flags) and transport mechanics (curl examples with Bearer token headers). End users with an MCP connector would receive curl instructions they don't need, and the skill was coupled to a specific integration method.

**Change:** Removed the Curl Examples section (6 curl commands, ~30 lines) from the skill. Moved generic curl templates into the test harness's `build_system_prompt()` function, where they're appended to the base prompt for all tiers. The skill now teaches *what* to query (entities, IDs, recipes, red flags) without specifying *how* to make the call.

**What stayed in the skill:** Data model, object type ID table (both objectTypeId and API path columns retained), pipelines, operator workflow, data quality issues, red flags, query recipes, query checklist. The Iron Law was reworded from "use the exact paths below" to "use the object IDs and query patterns in this skill."

**What moved to the test harness:** Five generic curl templates (list, search, associations, pipelines, properties) with `{objectTypeId}` placeholders. The token is injected at prompt-build time. Applied to both Tier A/B and Tier C/D base prompts.

**Validation:** Ran D1 (data quality — products placed) post-refactor. Result: correct entity (Product Pitch 0-420), correct query path, data quality flagged, 31s/5 turns. Consistent with pre-refactor Tier D performance.

**Why this matters for the plugin:** The skill is now ready for distribution. Users with an MCP connector get clean domain instructions; the LLM uses MCP tools instead of curl. Users without a connector (or the test harness) get curl templates from the base prompt. Same skill, different transport.

---

## Sources

- [Superpowers: Agentic Skills Framework](https://github.com/obra/superpowers)
- [Building AI Coding Agents for the Terminal (arXiv, March 2026)](https://arxiv.org/html/2603.05344v1)
- [Addy Osmani — My LLM Coding Workflow Going into 2026](https://addyosmani.com/blog/ai-coding-workflow/)
- [Lakera — Ultimate Guide to Prompt Engineering in 2026](https://www.lakera.ai/blog/prompt-engineering-guide)
