/**
 * Catalogue of step kinds a user can pick when adding a step to a flow.
 * The `icon` field is an inline SVG (data URI) used as the small image
 * shown in the step-type picker. Keeping these inline avoids needing to
 * ship binary assets and keeps the picker render synchronous.
 *
 * To add a new type: append an entry here. The DB stores the `key` only;
 * unknown keys round-trip through the UI by falling back to the `unknown`
 * placeholder rendered by `getStepType`.
 */

export type StepType = {
  key: string;
  label: string;
  description: string;
  icon: string;
};

const svg = (markup: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`,
  );

export const STEP_TYPES: ReadonlyArray<StepType> = [
  {
    key: "start",
    label: "Start",
    description: "Entry point of the flow.",
    icon: svg(`<circle cx="12" cy="12" r="9"/><polygon points="10,8 16,12 10,16" fill="currentColor"/>`),
  },
  {
    key: "action",
    label: "Action",
    description: "Performs work — call an API, run a job, etc.",
    icon: svg(`<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 12h8"/><path d="M8 9h5"/><path d="M8 15h6"/>`),
  },
  {
    key: "decision",
    label: "Decision",
    description: "Branches the flow based on a condition.",
    icon: svg(`<polygon points="12,3 21,12 12,21 3,12"/><path d="M9 12h6"/><path d="M12 9v6"/>`),
  },
  {
    key: "wait",
    label: "Wait",
    description: "Pauses for a duration or until an event.",
    icon: svg(`<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 2.5"/><path d="M9 3h6"/>`),
  },
  {
    key: "notify",
    label: "Notify",
    description: "Sends a message — email, push, webhook.",
    icon: svg(`<path d="M6 9a6 6 0 0 1 12 0v4l1.5 3h-15L6 13z"/><path d="M10 19a2 2 0 0 0 4 0"/>`),
  },
  {
    key: "input",
    label: "Input",
    description: "Collects data from a user.",
    icon: svg(`<rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 12h2"/><path d="M11 12h6"/>`),
  },
  {
    key: "end",
    label: "End",
    description: "Terminates the flow.",
    icon: svg(`<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>`),
  },
];

const STEP_TYPE_BY_KEY = new Map(STEP_TYPES.map((t) => [t.key, t]));

export const STEP_TYPE_KEYS = STEP_TYPES.map((t) => t.key);

export const DEFAULT_STEP_TYPE_KEY = "action";

const UNKNOWN_TYPE: StepType = {
  key: "unknown",
  label: "Unknown",
  description: "Step type no longer available.",
  icon: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-1 .4-1 1.2-1 2.2"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>`),
};

export function getStepType(key: string): StepType {
  return STEP_TYPE_BY_KEY.get(key) ?? { ...UNKNOWN_TYPE, key };
}
