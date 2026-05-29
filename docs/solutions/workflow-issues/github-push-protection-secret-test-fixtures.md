---
title: GitHub push protection blocks example API keys in secret-scrubber test fixtures
date: 2026-05-29
category: docs/solutions/workflow-issues
module: tests/unit/log.test.ts
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "Adding or editing fixtures that contain provider-prefixed secret patterns (Stripe sk_, AWS AKIA, GitHub ghp_, Resend re_)"
  - "git push is rejected by GitHub push protection / secret scanning"
  - "Recovering from a rejected push where the offending commit has NOT yet reached the remote"
  - "Writing tests for the secret scrubber in src/lib/log.ts"
related_components:
  - "testing_framework"
tags:
  - github-push-protection
  - secret-scanning
  - secret-scrubber
  - git-reset-soft
  - test-fixtures
---

# GitHub push protection blocks example API keys in secret-scrubber test fixtures

## Context

The secret scrubber in `src/lib/log.ts` redacts provider-prefixed credentials
(Stripe `sk_`/`pk_`, AWS `AKIA…`, GitHub `ghp_`/`gho_`, Resend `re_`, OpenAI
`sk-`) before anything is logged. To exercise it, `tests/unit/log.test.ts`
feeds sample strings through `scrubSecrets()` and asserts they come back
redacted.

The natural instinct is to paste a *realistic* example key into the fixture —
Stripe's well-known published `sk_test_…` docs example, or AWS's documented
example access key id (the `AKIA…EXAMPLE` value). That instinct is wrong here:
GitHub push protection scans **commit content**, recognises those published
example values as secrets, and rejects the push. The recovery is also
non-obvious because GitHub scans history, not just the working tree.

## Guidance

Two rules, one for the convention and one for the recovery.

**1. Secret-scrubber fixtures must use obviously-fake placeholders that still
match the scrubber regex.** Construct a value that satisfies the pattern shape
but is plainly synthetic — embed `EXAMPLE`, `NOT_REAL`, or `FAKE` in the
middle. The scrubber only cares about the prefix and length/charset, not the
payload, so a fake value exercises the regex exactly the same way a real one
would.

```ts
// tests/unit/log.test.ts — fixtures (illustrative)
// Stripe: scrubber keys on the sk_/pk_ prefix
const stripe = "sk_test_EXAMPLE_STRIPE_KEY_NOT_REAL";

// AWS: regex is /\bAKIA[0-9A-Z]{16}\b/ — must be uppercase A-Z/0-9, 16 chars
// after AKIA. "EXAMPLE" + filler keeps it obviously fake AND regex-valid.
const aws = "AKIAEXAMPLENOTREAL00";

expect(scrubSecrets(`key=${stripe}`)).not.toContain(stripe);
expect(scrubSecrets(aws)).toBe("[REDACTED_AWS_KEY]");
```

When you invent a placeholder, re-check the exact regex in
`src/lib/log.ts` (`SCRUBBERS`). The AWS pattern in particular demands
`[0-9A-Z]{16}` after `AKIA` — a lower-case or too-short filler will silently
fail to match and the assertion regresses without anyone noticing.

**2. Recover a push rejected for an unpushed commit with `git reset --soft`,
not `git commit --amend`.** Because the offending commit had not yet reached
`origin` (the push was rejected), un-commit it while keeping the changes
staged, fix the fixture, and create a fresh commit:

```bash
git reset --soft HEAD~1     # un-commit, keep changes staged in the index
# edit tests/unit/log.test.ts: swap real-looking keys for fake placeholders
git add tests/unit/log.test.ts
git commit -m "test: fake secret fixtures for scrubber"
git push
```

## Why This Matters

- **GitHub scans commit content, not just the current tree.** Deleting the
  offending line in a *later* commit does not clear the block — the secret is
  still present in the earlier commit's diff, which push protection inspects.
  You must rewrite the commit that introduced the value, not append a fix.
- **`git commit --amend` is the wrong tool when the commit is part of an
  in-progress rebase chain.** Amending rewrites whatever `HEAD` currently
  points at, which during a rebase may not be the commit you think. A
  `git reset --soft HEAD~1` un-commits cleanly, leaves the work staged, and
  lets you re-commit deliberately — no risk of folding the fix into the wrong
  parent. (If the bad commit had already reached the remote, this calculus
  changes: you would need history rewriting plus a force-push, and likely a
  secret rotation.)
- **Real-looking example keys are a recurring footgun.** Vendors publish
  example credentials specifically so people can copy them; GitHub's scanner is
  trained on exactly those published values. Fake-but-valid placeholders side-
  step the scanner entirely while still proving the scrubber works.

## When to Apply

- You are writing or editing any test that feeds credential-shaped strings to
  the scrubber in `src/lib/log.ts`.
- A `git push` fails with a GitHub push-protection / secret-scanning error and
  the flagged commit has not yet landed on the remote.
- You are tempted to fix a rejected push with a follow-up "delete the line"
  commit (it won't work) or with `git commit --amend` mid-rebase (wrong commit).

## Examples

Before — realistic example key, push rejected:

```ts
// DON'T: published vendor example values trip GitHub push protection
const stripe = "sk_test_<published-stripe-docs-example>";
const aws = "AKIA<documented-aws-example-id>";
```

After — obviously-fake placeholder, regex still matches, push succeeds:

```ts
// DO: synthetic value, same prefix/shape, plainly not a real key
const stripe = "sk_test_EXAMPLE_STRIPE_KEY_NOT_REAL";
const aws = "AKIAEXAMPLENOTREAL00"; // AKIA + 16 chars of [0-9A-Z]
```

Recovery sequence for the unpushed commit:

```bash
git reset --soft HEAD~1   # NOT: git commit --amend (wrong during a rebase)
# replace fixtures with fake placeholders, then:
git add tests/unit/log.test.ts && git commit && git push
```

## Related

- `src/lib/log.ts` — `SCRUBBERS` array; the source of truth for the regexes
  fixtures must satisfy.
- `tests/unit/log.test.ts` — the fixtures governed by this convention.
- `src/lib/log.server.ts` — server-side logging entry point that calls the
  scrubber.
