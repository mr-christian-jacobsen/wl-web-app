---
date: 2026-05-31
topic: docs-solutions-recommendations
focus: on docs/solutions and recommendations in general
mode: repo-grounded
---

# Ideation: Improving docs/solutions and recommendation surfacing

## Grounding Context

wl-web-app is a Next.js 15 (App Router) + TypeScript strict + Prisma (SQLite) + Auth.js (NextAuth v5) + Tailwind app. The `docs/solutions/` knowledge store currently holds 10 docs across 6 categories (architecture-patterns ×5, developer-experience, runtime-errors, security-issues, tooling-decisions, workflow-issues), all populated very recently. Frontmatter is rich (title, date, category, module, problem_type, component, severity, related_components, applies_when, tags) but tags are free-form and there is no machine validation. CLAUDE.md mentions `docs/solutions/` once but does not backlink from specific sections to specific docs. There is no SCHEMA.md inside the store, no top-level index, no `patterns/critical-patterns.md`, and no staleness signals (no `last_verified`, no `superseded_by`). Capture is manual via `/ce-compound` at session end, with no PR/CI-driven trigger.

**Reusable in-repo patterns this ideation builds on:** the OpenAPI drift-detection test (`tests/unit/openapi-coverage.test.ts` walks `src/app/api/**/route.ts` and fails CI on spec drift); the UI translation registry (`src/lib/translations.ts` + `instrumentation.ts` — code owns the catalog, boot-time non-destructive sync, server-cached reads, visible fallback for missing keys); the DB-backed SystemSetting key/value table with .env fallback.

**Prior art surfaced by external research:** ADRs (Nygard/MADR — append-only, status lifecycle, supersedes links, code-seam refs, quarterly review; explicit tooling gap); Google SRE postmortems (schema consistency = queryable goldmine; Postmortem of the Month newsletter; Wheel of Misfortune; action-item follow-through unsolved); Backstage TechDocs (catalog-backed entity-linked search; heavy infra for small repos); Atuin Desktop (executable runbooks — docs that prove they still work); enterprise RAG with freshness boost (over-engineered at <100 docs); DataHub Continuous Context (declared/derived/observed); NASA ASRS CALLBACK newsletter; medical CPC narratives (preserve wrong paths considered); OSS CHANGELOG (append-only, supersedes by version); FRACAS corrective-action ledger; TMX/XLIFF translation memory; MITRE CVE stable IDs + severity.

**Known failure modes in the prior art:** action-item follow-through is unsolved; RAG over-engineered at <100 docs; "lives in the repo" is weak discovery (file-exists ≠ file-read-at-the-right-moment); MADR tooling is fragmented.

## Topic Axes

- **capture** — how new learnings get triggered/drafted/written
- **structure** — schema, taxonomy, validation, tag hygiene, frontmatter contract
- **discovery** — how the right doc reaches the right person/agent at the right moment
- **freshness** — staleness signals, supersedes/deprecated, periodic refresh, action-item follow-through
- **dissemination** — push-based broadcasting and culture (newsletter, role-play, AI summaries)

## Ranked Ideas

### 1. Drift-Tested Catalog Stack
**Description:** One PR landing four interlocking pieces. (a) `tests/unit/docs-solutions-coverage.test.ts` walks `docs/solutions/**/*.md`, parses frontmatter, and fails CI on missing required keys, unknown `problem_type` / `category`, tags outside the registered allowlist, and broken `code_refs` / `superseded_by` targets; ships with a `pnpm docs:fix` autofix flag. (b) `KNOWN_TAGS` + `KNOWN_PROBLEM_TYPES` registry in `src/lib/docs-solutions-catalog.ts`, mirroring the shape of `src/lib/translations.ts`; an admin page surfaces orphaned tags. (c) MADR-style status lifecycle in frontmatter: stable `id: SOL-YYYY-NNN`, `status` (active/superseded/archived), `supersedes` / `superseded_by`, plus an optional `wrong_paths_considered` block borrowed from the medical-CPC analogy. (d) Server-rendered faceted browse page at `/super-admin/docs-solutions` that reads frontmatter live — no embeddings, no client search index — facet filters over the closed-catalog tags, supersedes-graph and stale-score inline.
**Axis:** structure (primary); discovery and freshness as side effects.
**Basis:** direct: `tests/unit/openapi-coverage.test.ts` and `src/lib/translations.ts` are the in-repo precedents this composes. external: MADR status lifecycle, MITRE CVE stable IDs + severity rubric, medical CPC narratives (preserve wrong paths considered as `wrong_paths_considered`).
**Rationale:** Schema consistency is what turns a folder of files into a queryable goldmine (Google SRE finding). Doing this at 10 docs is cheap; retrofitting at 100 docs is the difference between a catalog and a junk drawer. Reuses two patterns this repo already ships, so the cost case is concrete and small. Everything else in this ideation depends on the catalog + validator existing.
**Downsides:** 1–2 day PR. Forces canonical-tag and enum decisions now. Adds a `/super-admin` page surface to maintain.
**Confidence:** 90%
**Complexity:** Medium
**Status:** Explored

### 2. Push-Discovery Triad
**Description:** Three injection surfaces working together so a relevant doc reaches the right reader at the right moment instead of waiting for someone to grep. (a) Agent-side retrieval pre-step in `ce-plan` / `ce-work` / `ce-debug` / `ce-compound`: grep over titles+tags+applies_when (no embeddings until corpus > 100), injects top 2-3 docs as `RELEVANT_PRIOR_LEARNINGS` into agent context. (b) Per-module CLAUDE.md auto-backlink: `pnpm sync-docs-solutions` reads each doc's `module:` and updates a `<!-- docs-solutions:auto -->` block in the nearest CLAUDE.md with one-liners; CI drift-checks. (c) Session-start system-reminder injection: when a Claude Code session opens, match active branch + recent commits against the catalog, inject 0-3 relevant docs (0 is allowed).
**Axis:** discovery
**Basis:** reasoned — "file-exists ≠ file-read-at-the-right-moment" is the dominant failure mode of in-repo doc stores per the web research; push beats pull because it removes the recall step. direct: CLAUDE.md is already the pointer surface — this deepens it section-by-section.
**Rationale:** Without push, the corpus is write-only — the dominant failure mode of engineering wikis. The triad covers the three reader contexts (CLAUDE.md scan, ce-skill invocation, fresh session) so nothing falls through.
**Downsides:** Matcher quality matters; bad matches train people to ignore prompts. CLAUDE.md grows. System-reminder context budget is finite — keep injection to top-2.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 3. Auto-Draft Capture Pipeline
**Description:** Capture stops being a discipline-dependent ritual. (a) Post-commit hook (or PR-merge with `learning` label) runs headless ce-compound on the diff + PR description + session transcript and decides "non-trivial?" — null or a draft to `docs/solutions/_inbox/`. (b) Existing session-end ce-compound also drops to inbox rather than `docs/solutions/` directly. (c) Weekly `ce-compound-triage` skill batches inbox drafts, dedupes against the catalog (depends on Idea 1), merges near-duplicates, opens one review PR with survivors assigned to original authors. Capture template is pre-filled from the catalog (Idea 1's `KNOWN_TAGS`/`KNOWN_PROBLEM_TYPES`) so drafts are born well-formed.
**Axis:** capture
**Basis:** reasoned — manual capture at session end has an obvious silent failure (forgotten under load, exactly when valuable). Separating scribe (machine) from curator (human approval) puts judgment where it belongs and removes the discipline tax.
**Rationale:** Capture rate decouples from engineer discipline. "Too many drafts to review" is a strictly better problem than "silently missed learnings." Triage cadence + de-dup keeps the inbox tractable.
**Downsides:** Approval PRs add review load. Triage must be opinionated or it becomes a graveyard. Depends on Idea 1's catalog for dedup sanity. Drafts may be lower-quality than hand-written.
**Confidence:** 70%
**Complexity:** Medium-High
**Status:** Unexplored

### 4. Tiered Recommendation Lifecycle: Registry → Eval → Rule
**Description:** A doc's "recommendation" becomes a first-class object with a promotion path. (a) `docs/solutions/recommendations.yaml` keyed registry (`R-001: "Every /api/super-admin/** handler must call requireSuperAdmin() first."`); docs cite recommendations by ID (`{{R-001}}`) rendered inline; CI fails on broken refs. (b) Promotion tiers per recommendation: prose → automated eval (a small test asserting current code obeys it) → lint rule / pre-commit hook / middleware check. (c) `corrective_actions: [{id, description, status: open|landed|wontfix, evidence_pr?}]` block on docs; `/super-admin/solutions/actions` lists open actions across all docs; CI closes by PR label/title pattern.
**Axis:** structure + freshness + dissemination
**Basis:** external — TMX/XLIFF translation memory (segments reused verbatim across many docs, edited in one place), FRACAS corrective-action tracking. direct: `src/middleware.ts` already enforces "Never import lib/auth.ts" — exactly the shape of a high-confidence rule that should be a lint check, not prose.
**Rationale:** The highest-value learnings have a binary right/wrong shape — exactly the shape lint rules express. Tiering closes the loop on action-item follow-through (the unsolved SRE problem). The TMX registry stops the same rule from being paraphrased across docs and drifting.
**Downsides:** Heavier than Idea 1; only some recommendations earn promotion to lint rules. Promotion-to-rule is engineering work, not auto. Risk of over-formalizing rules still being learned. Tier 1 (registry only) is the Medium-complexity version worth doing alone.
**Confidence:** 65%
**Complexity:** High (full); Medium (Tier 1 registry only)
**Status:** Unexplored

### 5. Cross-Repo Engineering Memory
**Description:** Move `docs/solutions/` out of wl-web-app into a shared sibling repo (e.g. `servicelovers-engineering-memory`) consumed by all 6 active repos in the workspace. Each repo's CLAUDE.md gets a one-line pointer. The drift validator (Idea 1) and code-churn signal (Idea 6) live in the memory repo and run via a small CI shim in each consuming repo.
**Axis:** structure (strategic)
**Basis:** reasoned — the environment shows 6 active sibling repos sharing infra choices (Auth.js, Prisma, Next.js, validation, AWS pieces). A Stripe-webhook learning applies in all six; an edge-bundle pitfall applies in two. The duplication tax of re-learning is high; cross-repo lookup is trivial. 10 docs is the cheapest moment to migrate.
**Rationale:** Portfolio-level move, not a wl-web-app move. Compounding happens across the whole engineering footprint, not just one project.
**Downsides:** Coordination across 6 repos. wl-web-app loses an in-tree surface. Migration tooling needed. Not every learning generalizes. Ownership/governance ambiguity.
**Confidence:** 60%
**Complexity:** Medium-High
**Status:** Unexplored

### 6. Code-Churn-Triggered Freshness Review
**Description:** Replace self-reported `last_verified` (nobody bumps it) with derived freshness. A CI step on every PR intersects the diff's file paths with each doc's `code_refs` / `module:` glob. Touched docs get `last_verified` cleared automatically and a banner ("Code touched in PR #N — review claims") on the rendered doc. The PR description grows a "Learnings touched" section with three prompts per doc: still-true / supersede / archive. Optional `stale_score` field: max `git log` mtime of `module:` glob since `last_updated`.
**Axis:** freshness
**Basis:** direct — OpenAPI drift-test pattern applied to docs. external: DataHub Continuous Context (observed/derived tier — freshness as a computed property). reasoned: action-item follow-through fails because nobody is prompted at the right moment; routing the prompt to the PR that touched the code puts the question in front of the only person who can answer it.
**Rationale:** Self-reported freshness fields rot the same way docs do — they require the same discipline they aim to enforce. Code-churn-derived freshness needs zero ongoing discipline; the signal strengthens monotonically with codebase activity.
**Downsides:** Depends on accurate `code_refs`/`module:` paths. Heavy churn produces noisy banners. Doesn't catch non-code staleness (deprecating libraries, vendor API changes).
**Confidence:** 80%
**Complexity:** Low-Medium
**Status:** Unexplored

### 7. Recurring Solutions Digest
**Description:** A weekly scheduled task (`mcp__scheduled-tasks` or a GitHub Action) diffs `docs/solutions/` over the last 7 days and renders a digest: new docs added, docs marked superseded/archived, top-3 stale-risers from Idea 6, plus an LLM-picked "highlight of the week" pinned to `/super-admin` for 7 days. Destination is configurable (PR for review-and-merge ritual, Slack channel, or admin dashboard widget).
**Axis:** dissemination
**Basis:** external — Google SRE "Postmortem of the Month" newsletter and NASA ASRS CALLBACK — the documented finding that the feedback loop IS the product, not the database.
**Rationale:** A write-only KB is the dominant failure mode of engineering wikis. Push-based dissemination at a regular cadence creates a recall handle ("oh right, we wrote that") that makes future pull-discovery more likely.
**Downsides:** Needs an audience that actually reads. Can become wallpaper if not curated. "Highlight of the week" is LLM-picked; quality varies.
**Confidence:** 75%
**Complexity:** Low
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason rejected |
|---|------|-----------------|
| 1.1 | Frontmatter linter (Vitest drift-test) | Duplicates 4.1 — absorbed into Idea 1 |
| 1.2 | Pre-write duplicate-check in /ce-compound | Covered by Idea 1's browse page + catalog; standalone redundant |
| 1.3 | Code-seam `// see-doc` backlinks | Variant of push-discovery — absorbed into Idea 2 |
| 1.4 | `last_verified` + quarterly nag PR | Idea 6 (code-churn-derived) is cheaper and needs no discipline |
| 1.8 | Tag-collision report on PRs | Covered by Idea 1's catalog — prevents drift at write time, not at PR review |
| 2.1 | `// @learning` comments auto-emit doc stubs | Speculative basis; Idea 3 covers the auto-draft pattern with stronger grounding |
| 2.2 | Delete the categories folder, tags only | Minor restructuring; doesn't address the core failure modes |
| 2.4 | Kill the doc body, frontmatter-only | Loses the medical-CPC narrative value preserved by Idea 1's `wrong_paths_considered` |
| 2.6 | ESLint warning on edits to documented files | Variant of push-discovery — absorbed into Idea 2 |
| 2.8 | Derive freshness from `git log --follow` | Mechanism merged into Idea 6 |
| 3.1 | JIT-compile learnings, no files stored | Not actionable today; dodges the discoverability problem rather than solving it |
| 3.3 | PR-open embedding match → comment | Covered by Idea 2's session matcher + Idea 7 digest |
| 3.5 | Reframe docs/solutions as an eval suite | Useful reframe but absorbed into Idea 4's eval tier; not standalone |
| 3.6 | Pointer lives in file-header magic comment | Variant of push-discovery — absorbed into Idea 2 |
| 3.7 | Freshness from application-log (DataHub observed tier) | Infrastructure too heavy at 10 docs; Idea 6 is a cheaper proxy |
| 5.1 | Climbing route topo block | Cute analogy but the topo = frontmatter + code_refs; absorbed into Idea 1 |
| 5.3 | PMEST faceted classification | Premature taxonomy at 10 docs; revisit at corpus growth |
| 5.4 | Chess opening book — pre-commit position lookup | Variant of push-discovery — absorbed into Idea 2 |
| 5.5 | Spaced-repetition (Anki) staleness scheduling | Over-engineered at 10 docs; Idea 6 catches the same signal cheaper |
| 5.6 | Theater prompt book marginalia layer | Premature at 10 docs; high-value at 100+ |
| 6.2 | Zero-human authorship (full) | Too aggressive; Idea 3 is the 10% buildable today |
| 6.4 | 90-day forced expiry | Too aggressive; Idea 6 is the softer derived signal |
| 6.5 | Structured DB rows, not markdown | Premature; markdown-in-repo works at this scale; cost case fails |
| 6.6 | Audience is the next AI model | Reframe absorbed into Idea 2's agent-injection spirit; not standalone |
| 6.7 | Single mega `SOLUTIONS.md` | Would regress quickly with any growth; cost case fails |
| 6.8 | Validation at read time only | Expensive per-read; Idea 6 catches drift at PR time cheaper |
| 22 ideas | (absorbed into surviving ideas above) | 1.5, 1.6, 1.7, 2.3, 2.5, 2.7, 3.2, 3.4, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.2, 5.7, 5.8, 6.1, 6.3 |
