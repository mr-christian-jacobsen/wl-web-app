---
date: 2026-05-31
topic: tag-catalog
---

# Requirements: Tag catalog for super-admin

## Summary

Add a reusable tag catalog to super-admin — categories (name + description) and tags (name, in zero or more categories) — managed from a single `/super-admin/tags` page with a categories sidebar and a tag list that supports search, sort, and pagination. Surveys are the first consumer: the survey editor gets a tag picker that groups tags by category. The catalog is designed so other entities can adopt tags later without changes to its own surface.

---

## Problem Frame

Today no entity in the app can be tagged. Surveys in particular accumulate in a flat list as the team creates more, with no admin-side way to label them by purpose, audience, or status. The user expects further entities (not yet implemented) to want the same vocabulary, so the catalog should be reusable from the start: a single tag inventory that any entity can opt into via its own attachment, rather than a per-entity tag column re-invented N times.

Categories exist as a separate concept (rather than tags-only-with-a-namespace prefix) because the brainstorm chose a real organizing dimension: the admin should be able to think in groups when browsing the catalog AND when picking tags on a survey. M:N between tags and categories is preferred over a single-category-per-tag shape because the same concept can legitimately belong to more than one grouping (e.g., a "compliance" tag is both topical and audience-related).

---

## Key Decisions

- **Catalog is global and admin-managed.** No `userId` ownership — tags and categories belong to the install, like Languages and Email templates. The same admin nav guard applies to every page and API surface.
- **Categories are a real organizing dimension, not admin-only metadata.** The catalog page shows a categories sidebar (which doubles as the entry point for category CRUD); the survey editor's tag picker groups tags by their categories. A tag in two categories appears under both group headings — this is the natural and accepted consequence of M:N, not a bug to dedupe.
- **Asymmetric delete semantics — by design.** Deleting a category just removes the tag↔category links (tags survive and surface under "Uncategorized"); deleting a tag that is currently applied to one or more surveys is refused with a "remove this tag from N surveys first" message. The rationale: categories are admin-only organizational metadata (cheap to remove, downstream effect is invisible to end-users), tags are user-visible on surveys (deletion would silently alter what those surveys look like).
- **Catalog-only tag creation in v1.** Admins create tags from the tags page; the survey editor only attaches tags that already exist. Keeps the catalog the single source of truth and avoids drift (typos, near-duplicates) from inline creation under time pressure. The inline-create affordance can be added later if the friction shows up in practice.
- **Surveys are the first consumer; later consumers attach independently.** When a new entity wants to tag, it adds its own attachment in its own iteration without changes to the tag catalog itself. The catalog stays neutral about what is being tagged.
- **Server-side pagination from day one.** The existing super-admin lists (Users, Languages, Surveys) all fetch everything and filter in-memory. The tag list is the first list expected to scale past comfortable in-memory size (hundreds or more), so search, sort, and pagination are pushed to the API: the server accepts query parameters for query / sort / page / page-size, returns the matching slice plus the total count, and the client renders only that slice. This introduces a new list pattern in this repo; the catalog is the right place to establish it.

---

## Actors

- A1. **Super admin** — the only user who interacts with `/super-admin/tags` (catalog CRUD) and with the survey-editor tag picker (attaching/detaching tags on a survey). All other roles are out of scope for this iteration; non-admin authenticated users never see the catalog or its tags.

---

## Key Flows

- F1. **Browse the tag catalog**
  - **Trigger:** Super admin opens `/super-admin/tags`.
  - **Actors:** A1
  - **Steps:** The page renders a categories sidebar (each category with a tag count, plus synthetic entries for "All tags" and "Uncategorized") and a tag list on the right showing tags in the active scope. The list supports text search by tag name, sort by name and by usage count, and pagination across the result set.
  - **Outcome:** Admin sees the catalog at a glance, can drill into a category, search across all tags, or jump to "Uncategorized" to find tags with no category.
  - **Covered by:** R3, R4, R5, R6, R7

- F2. **Create / edit / delete a category**
  - **Trigger:** Super admin clicks "New category" in the sidebar, or selects an existing category to edit or delete.
  - **Actors:** A1
  - **Steps:** Admin provides a name (required) and description (optional). Edits update both fields. Delete asks for confirmation that names the number of tags currently in the category; on confirm, those tags lose this category membership but stay in the catalog.
  - **Outcome:** Sidebar reflects the change immediately; orphaned tags (those whose last category was the deleted one) appear under "Uncategorized".
  - **Covered by:** R4, R10

- F3. **Create / edit / delete a tag**
  - **Trigger:** Super admin clicks "New tag" in the tag list, or chooses edit/delete on a tag row.
  - **Actors:** A1
  - **Steps:** Admin provides a name (required) and selects zero or more categories the tag belongs to. Edits update both fields. Delete first checks whether the tag is applied to any survey: if yes, refuses with the count; if no, asks for confirmation and removes the tag.
  - **Outcome:** Tag appears under each of its categories in the catalog and in the survey-editor picker; deletion is reflected in both surfaces.
  - **Covered by:** R8, R9, R11

- F4. **Attach / detach tags on a survey**
  - **Trigger:** Super admin opens the survey editor at `/super-admin/surveys/[id]`.
  - **Actors:** A1
  - **Steps:** Editor includes a tag section that lists currently-attached tags and a picker grouped by category (with an "Uncategorized" group at the bottom). Admin toggles tags on or off; changes save through the editor's existing save flow.
  - **Outcome:** Selected tags are attached to the survey and counted in the catalog's per-tag usage count.
  - **Covered by:** R12, R13, R14

---

## Requirements

### Catalog model

- R1. The catalog has two entities: a **category** (name, description) and a **tag** (name). A tag may belong to zero or more categories; a category may contain zero or more tags. There is no maximum cardinality on either side.
- R2. Tag and category names are stored trimmed and case-preserved (matching the existing DB-write normaliser in `src/lib/db.ts`). Names must be unique within their kind, case-insensitively — "Compliance" and "compliance" cannot coexist as two tags or as two categories. Exact name-length limits are settled during planning, short enough that the picker stays readable.

### Browse and discover

- R3. `/super-admin/tags` is the single entry point for the catalog. The page consists of a categories sidebar (left) and a tag list (right) on one screen. There are no separate `/super-admin/tag-categories` or `/super-admin/uncategorized-tags` pages, and no top-level tabs.
- R4. The sidebar lists every category with its current tag count, plus two synthetic entries: "All tags" (shows every tag regardless of category) and "Uncategorized" (shows tags with zero category memberships). Categories sort alphabetically by default. Category CRUD (new / edit / delete) is reachable from the sidebar — this is the only place categories are managed.
- R5. The tag list has a text search field that filters by tag name (substring, case-insensitive). Search composes with the active sidebar scope — searching within "Audience" returns only tags that match AND are in "Audience".
- R6. The tag list is sortable. At minimum: by name (alphabetical) and by usage count (the number of surveys the tag is currently attached to). Default sort is name ascending. Sort composes with search and scope.
- R7. The tag list is paginated server-side. The API accepts query parameters for search text, sort field, sort direction, page number, and page size; the response carries one page of rows plus the total count for the current filter. Page size is fixed (specific number settled in planning). A paginator at the bottom of the list lets the admin move between pages, and the current total count (in-scope, post-search) is visible.

### Edit and delete

- R8. Tag creation is performed only from the tags page. The form asks for a name (required) and lets the admin attach zero or more categories from the existing category list. The form is reachable from the tag list (e.g., a "New tag" button) and from the empty-state of a category scope.
- R9. A tag's name and category memberships are editable from the same form, reached from a per-row action on the tag list. The same uniqueness rule from R2 applies on edit.
- R10. Deleting a category removes the tag↔category links for every tag currently in it, leaving those tags in the catalog. Tags whose other categories survive continue to appear under those categories; tags that had no other category move to "Uncategorized". The confirmation dialog states how many tags will lose this category membership.
- R11. Deleting a tag that is currently applied to one or more surveys is refused with HTTP 409 (or equivalent). The response names the survey count and prompts the admin to detach the tag from those surveys first. Deleting an unused tag asks for a plain confirmation and removes it; its category memberships are cleaned up as a side effect.

### Survey integration

- R12. The survey editor (`/super-admin/surveys/[id]`) exposes a tag section that lists the tags currently attached to the survey and provides a picker for adding or removing tags. The picker shows tags grouped by category, with each category as a labelled group and an "Uncategorized" group at the bottom. A tag that belongs to two categories appears in both groups; selecting it in either reflects in both because they refer to the same tag.
- R13. Attaching and detaching tags persists with the survey's existing save flow — the admin makes changes inside the editor, then saves. There is no separate save round-trip for tags, and no draft tag state stored independently of the survey.
- R14. The catalog computes a per-tag "usage count" from the number of surveys currently attached. This count powers the sort-by-usage option (R6) and the deletion-refusal message (R11). It reflects current attachment state only, not historical attachments. Whether it is computed at read time or maintained as a counter is decided in planning.

### Auth and surface

- R15. Every page and API endpoint backing the catalog, the survey-side tag picker, and the survey-side tag attach/detach requires a super-admin session, enforced both by the edge middleware route guard (per `src/middleware.ts`) and by `requireSuperAdmin()` in every API handler (per the rule in `CLAUDE.md`). Non-admin authenticated users redirect away from `/super-admin/tags`; the picker section never renders for them.
- R16. Tag and category writes flow through the existing DB-write normaliser in `src/lib/db.ts` without exemption — names are trimmed automatically by the write layer, route handlers do not need to call `.trim()` themselves. No fields require addition to `LOWERCASE_FIELDS` or `NEVER_NORMALIZE`.

---

## Acceptance Examples

- AE1. **Delete a category that has tags in it.**
  - **Given:** Category "Audience" has three tags — "Internal" (only in "Audience"), "External" (also in "Topic"), and "Partner" (also in "Topic" and "Region").
  - **When:** Admin clicks delete on "Audience" and confirms.
  - **Then:** "Audience" disappears from the sidebar. All three tags remain in the catalog. "Internal" now shows under "Uncategorized". "External" shows under "Topic" only. "Partner" shows under "Topic" and "Region".
  - **Covers:** R10

- AE2. **Delete a tag that is in use.**
  - **Given:** Tag "Compliance" is currently attached to 4 surveys.
  - **When:** Admin clicks delete on the "Compliance" row in the tag list.
  - **Then:** The UI shows a message naming the count ("This tag is attached to 4 surveys. Remove it from those surveys before deleting."). The tag is not deleted; survey attachments are untouched; category memberships are untouched.
  - **Covers:** R11

- AE3. **Delete a tag that is not in use.**
  - **Given:** Tag "Pilot" is in 2 categories but applied to 0 surveys.
  - **When:** Admin clicks delete on the "Pilot" row and confirms.
  - **Then:** "Pilot" is removed from the catalog, removed from both categories' tag counts, and no longer appears in the survey-editor picker on future loads.
  - **Covers:** R11

- AE4. **A tag in two categories shows under both groups in the picker.**
  - **Given:** Tag "Compliance" is in categories "Audience" and "Topic". The admin opens a survey with no tags attached.
  - **When:** Admin opens the tag picker on the survey editor.
  - **Then:** "Compliance" appears once under the "Audience" group and once under the "Topic" group. Checking it in either group selects it in both (one underlying tag). Saving attaches "Compliance" to the survey once.
  - **Covers:** R12

- AE5. **Search composes with category scope.**
  - **Given:** Sidebar scope is "Topic"; the search field is empty; "Topic" contains 30 tags. The catalog also contains tags matching "comp" in other categories.
  - **When:** Admin types "comp" in the search field.
  - **Then:** The list shows only tags in "Topic" whose name contains "comp" (case-insensitive). Matches in other categories are not surfaced. Sort and pagination apply to the filtered result; the total-count display reflects the filtered count.
  - **Covers:** R5, R6, R7

---

## Scope Boundaries

### Deferred for later

- Joining tags to entities other than surveys. The user said other features will want tags later but those features aren't built yet. The catalog's shape accommodates new consumers without changes; each one adds its own attachment in its own iteration.
- Inline tag creation from the survey editor. The catalog is the only place to create tags in v1. If the round-trip friction shows up in practice, revisit later.
- Bulk operations on tags or categories — multi-select delete, merging two tags into one, rename-and-cascade. Single-item CRUD is the v1 scope; bulk lands when there's a concrete pain story.
- A tag detail page (per-tag landing, list of surveys it's on, time series). The deletion-refusal message names the count but doesn't enumerate the surveys; if admins need that, a detail page is plausible later.
- Tag colors, icons, slugs, or any visual differentiation beyond name and category grouping.

### Outside this product's identity

- Localising tag or category names. Tags are admin-managed identifiers (like `EmailTemplate.name`); the per-language translation system targets user-facing content the admin can't directly edit. If a real use case for translated tags emerges, it's a separate brainstorm.
- Public-facing tag pages or any surface that exposes tags to non-admin users. The catalog is internal to admin tooling; tags never reach `/s/[id]` or any public route.
- Tag hierarchies — nested categories, parent-child tag relationships, "this tag implies that tag". The relationship is flat M:N between tags and categories; categories do not nest.

---

## Outstanding Questions

### Deferred to planning

- Exact maximum length for tag name, category name, and category description. Pick values during planning that fit the picker layout without bloating the UI.
- Whether the tag list row shows the tag's category memberships inline (chips) or only on hover / edit. Either works; pick during planning based on the expected average category count per tag.
- Whether per-tag usage count is computed at read time (count query per tag) or maintained as a denormalised counter. Either is fine for the expected scale; pick during planning based on which fits the data-fetch pattern chosen for R7.
- Whether the categories sidebar itself ever needs its own search or pagination. The brainstorm assumed the category list is small enough to render in full; revisit if the scale assumption changes.
