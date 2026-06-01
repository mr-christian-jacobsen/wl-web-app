/**
 * Static catalog of predicate metadata — the bits that are safe to ship
 * to the client. Lives in its own module (no Prisma / no `log.server`
 * imports) so client components like `AdminTaskEditor.tsx` can render
 * the predicate dropdown without dragging the server bundle (nodemailer,
 * fs, dns, net) through the webpack graph.
 *
 * The runtime evaluation logic lives in `src/lib/predicates.ts` next to
 * the DB calls; that module imports this catalog and decorates each
 * entry with its `evaluate` closure to produce the full `KNOWN_PREDICATES`
 * tuple. Tests + `validators.ts` should import the keys from here when
 * they don't need the evaluator, to keep their bundles lean too.
 *
 * v1 floor: `avatar_present`, `email_verified`, `language_set`.
 * `name_set` is intentionally absent because `signupSchema` already
 * enforces a non-empty `name` (Zod `min(1)`), so the predicate would
 * be structurally always-true.
 */

export type PredicateCatalogEntry = {
  /** Stable identifier, e.g. `avatar_present`. */
  key: string;
  /** Short admin-facing label, e.g. "Profile picture is set". */
  name: string;
  /** Longer hint shown next to the dropdown choice. */
  description: string;
  /** Where the user should go to satisfy the predicate, if any. */
  deepLinkPath?: string;
};

export const PREDICATE_CATALOG = [
  {
    key: "avatar_present",
    name: "Profile picture is set",
    description: "True once the user has uploaded an avatar on /profile.",
    deepLinkPath: "/profile",
  },
  {
    key: "email_verified",
    name: "Email address is verified",
    description: "True once the user has clicked the verification link in their welcome email.",
  },
  {
    key: "language_set",
    name: "Preferred language is chosen",
    description: "True once the user has picked a preferred language on /profile.",
    deepLinkPath: "/profile",
  },
] as const satisfies ReadonlyArray<PredicateCatalogEntry>;

export type KnownPredicateKey = (typeof PREDICATE_CATALOG)[number]["key"];

/**
 * Stable list of valid predicate keys, exported so validators and the
 * admin editor can `.includes()` against it without re-deriving from
 * the catalog tuple. Order matches `PREDICATE_CATALOG`.
 */
export const KNOWN_PREDICATE_KEYS = PREDICATE_CATALOG.map(
  (p) => p.key,
) as ReadonlyArray<KnownPredicateKey>;
