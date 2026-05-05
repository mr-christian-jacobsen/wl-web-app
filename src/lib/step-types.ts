/**
 * Catalogue of step kinds a survey author can pick when adding a step.
 * Each entry has a small inline-SVG `icon` rendered as a tile in the
 * type picker. Types are kept inline (no asset pipeline) so the picker
 * renders synchronously and the registry can be extended without
 * shipping new files.
 *
 * `requiresOptions: true` means the step needs a non-empty list of
 * choice labels (`single_choice`, `multi_choice`). The validator
 * enforces this; the editor surfaces the options field automatically
 * when this flag is set.
 *
 * To add a new type: append an entry. The DB stores the `key` only;
 * unknown keys round-trip through the UI by falling back to the
 * `unknown` placeholder rendered by `getStepType`.
 */

export type StepType = {
  key: string;
  label: string;
  description: string;
  icon: string;
  requiresOptions?: boolean;
};

const svg = (markup: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`,
  );

export const STEP_TYPES: ReadonlyArray<StepType> = [
  {
    key: "short_text",
    label: "Short text",
    description: "Single-line free-text answer.",
    icon: svg(`<rect x="3" y="9" width="18" height="6" rx="1.5"/><path d="M6 12h6"/>`),
  },
  {
    key: "long_text",
    label: "Long text",
    description: "Multi-line free-text answer.",
    icon: svg(`<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M6 9h12"/><path d="M6 12h12"/><path d="M6 15h8"/>`),
  },
  {
    key: "single_choice",
    label: "Single choice",
    description: "Pick exactly one option.",
    icon: svg(`<circle cx="7" cy="8" r="2.5"/><circle cx="7" cy="8" r=".75" fill="currentColor"/><path d="M12 8h7"/><circle cx="7" cy="16" r="2.5"/><path d="M12 16h7"/>`),
    requiresOptions: true,
  },
  {
    key: "multi_choice",
    label: "Multiple choice",
    description: "Pick zero or more options.",
    icon: svg(`<rect x="4.5" y="5.5" width="5" height="5" rx="1"/><path d="M5.5 8l1.25 1.25L8.75 6.75"/><path d="M12 8h7"/><rect x="4.5" y="13.5" width="5" height="5" rx="1"/><path d="M12 16h7"/>`),
    requiresOptions: true,
  },
  {
    key: "rating",
    label: "Rating",
    description: "1–5 star scale.",
    icon: svg(`<polygon points="12,4 14.2,9 19.5,9.5 15.5,13 16.7,18.3 12,15.6 7.3,18.3 8.5,13 4.5,9.5 9.8,9"/>`),
  },
  {
    key: "yes_no",
    label: "Yes / No",
    description: "Boolean answer.",
    icon: svg(`<path d="M5 8l2.5 2.5L13 5"/><path d="M15 13l5 5"/><path d="M20 13l-5 5"/>`),
  },
  {
    key: "date",
    label: "Date",
    description: "Calendar date.",
    icon: svg(`<rect x="3.5" y="5.5" width="17" height="14" rx="1.5"/><path d="M3.5 10h17"/><path d="M8 4v3"/><path d="M16 4v3"/><circle cx="12" cy="14.5" r="1.25" fill="currentColor"/>`),
  },
];

const STEP_TYPE_BY_KEY = new Map(STEP_TYPES.map((t) => [t.key, t]));

export const STEP_TYPE_KEYS = STEP_TYPES.map((t) => t.key);

export const DEFAULT_STEP_TYPE_KEY = "short_text";

const UNKNOWN_TYPE: StepType = {
  key: "unknown",
  label: "Unknown",
  description: "Step type no longer available.",
  icon: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-1 .4-1 1.2-1 2.2"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>`),
};

export function getStepType(key: string): StepType {
  return STEP_TYPE_BY_KEY.get(key) ?? { ...UNKNOWN_TYPE, key };
}

export function stepTypeRequiresOptions(key: string): boolean {
  return STEP_TYPE_BY_KEY.get(key)?.requiresOptions === true;
}

/** Splits the stored `options` blob into an array, dropping blanks. */
export function parseOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
