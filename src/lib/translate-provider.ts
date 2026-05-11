import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import { logError } from "@/lib/log.server";
import {
  getTranslateConfigForSend,
  type TranslateProvider,
} from "@/lib/system-settings";

/**
 * Provider-agnostic auto-translation. Both implementations share the
 * same input/output shape so the API route doesn't have to care which
 * one the admin picked in /super-admin/system-settings.
 *
 * The contract is intentionally **batched** — one API call covers every
 * item the caller wants translated, with a single structured JSON
 * response. This keeps cost predictable and the latency one round-trip
 * even when an admin clicks "Translate all missing" on 80 rows.
 */

export type AutoTranslateInputItem = {
  /** Stable key identifier — used to correlate the response back. */
  key: string;
  /** English source text to translate. */
  sourceText: string;
  /** Human-readable label for the string ("Login — Sign-in button label"). */
  name: string;
  /** Optional longer hint about where this string appears. */
  description?: string | null;
};

export type AutoTranslateInput = {
  /** Free-form description of the target locale, e.g. "Danish (DK)". */
  targetLanguageLabel: string;
  /** ISO 639-1 code of the target language (e.g. "da"). */
  targetLanguageCode: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "DK"). */
  targetCountryCode: string;
  items: AutoTranslateInputItem[];
};

export type AutoTranslateOutputItem = {
  key: string;
  translation: string;
};

export type AutoTranslateResult = {
  provider: TranslateProvider;
  model: string;
  items: AutoTranslateOutputItem[];
};

/**
 * Top-level entry point. Reads the admin-configured provider+key from
 * `SystemSetting`, dispatches to the matching implementation, returns
 * the resulting items. Throws when no API key is configured for the
 * selected provider — caller turns that into a 400 with a friendly
 * message.
 */
export async function autoTranslateBatch(
  input: AutoTranslateInput,
): Promise<AutoTranslateResult> {
  const config = await getTranslateConfigForSend();
  if (!config) {
    throw new Error(
      "Auto-translate is not configured. Set the API key for the selected provider in /super-admin/system-settings.",
    );
  }
  if (input.items.length === 0) {
    return { provider: config.provider, model: config.model, items: [] };
  }

  try {
    const items =
      config.provider === "anthropic"
        ? await translateViaAnthropic(input, config.apiKey, config.model)
        : await translateViaOpenAI(input, config.apiKey, config.model);
    return { provider: config.provider, model: config.model, items };
  } catch (err) {
    await logError(err, {
      context: {
        feature: "auto-translate.batch",
        provider: config.provider,
        model: config.model,
        itemCount: input.items.length,
        targetLanguage: input.targetLanguageLabel,
      },
    });
    throw err;
  }
}

function buildPrompt(input: AutoTranslateInput): {
  system: string;
  user: string;
} {
  // Items are presented as JSON so the model can echo `key` back verbatim
  // and we can correlate without parsing free text. The system prompt
  // explicitly forbids extra prose because both providers will sometimes
  // try to "explain" their output.
  const payload = input.items.map((it) => ({
    key: it.key,
    source: it.sourceText,
    used_as: it.name,
    context: it.description ?? undefined,
  }));

  const system = [
    "You translate short user-interface labels for a web application.",
    `Target language: ${input.targetLanguageLabel} (ISO ${input.targetCountryCode}-${input.targetLanguageCode}).`,
    "For each item, return a translation that fits the described role.",
    "Match capitalisation conventions of the target language — do not force English-style title case.",
    "Preserve placeholders (e.g. {name}, %s) verbatim.",
    "Preserve trailing/leading punctuation and decorative characters such as arrows (→, ←) or ellipses (…).",
    "Keep the translation roughly the same length as the source — it will appear in the same UI affordance.",
    "Output ONLY a single JSON object of shape {\"items\":[{\"key\":string,\"translation\":string},...]}.",
    "No preamble, no markdown fences, no commentary.",
  ].join(" ");

  const user = JSON.stringify({ items: payload });
  return { system, user };
}

async function translateViaAnthropic(
  input: AutoTranslateInput,
  apiKey: string,
  model: string,
): Promise<AutoTranslateOutputItem[]> {
  const client = new Anthropic({ apiKey });
  const { system, user } = buildPrompt(input);

  const resp = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return parseAndValidate(text, input.items);
}

async function translateViaOpenAI(
  input: AutoTranslateInput,
  apiKey: string,
  model: string,
): Promise<AutoTranslateOutputItem[]> {
  const client = new OpenAI({ apiKey });
  const { system, user } = buildPrompt(input);

  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  const text = resp.choices[0]?.message?.content?.trim() ?? "";
  return parseAndValidate(text, input.items);
}

/**
 * Coerce the model's response into the agreed shape. Tolerant of stray
 * code fences and a missing `items` wrapper, but rejects anything that
 * can't be mapped back to a `key` in the request.
 */
function parseAndValidate(
  text: string,
  expected: AutoTranslateInputItem[],
): AutoTranslateOutputItem[] {
  if (!text) throw new Error("Auto-translate returned an empty response");

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Auto-translate returned non-JSON: ${cleaned.slice(0, 200)}`);
  }

  const rawItems =
    parsed && typeof parsed === "object" && "items" in parsed
      ? (parsed as { items: unknown }).items
      : parsed;

  if (!Array.isArray(rawItems)) {
    throw new Error("Auto-translate response did not include an items array");
  }

  const wantedKeys = new Set(expected.map((i) => i.key));
  const out: AutoTranslateOutputItem[] = [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const key = (it as { key?: unknown }).key;
    const translation = (it as { translation?: unknown }).translation;
    if (typeof key !== "string" || typeof translation !== "string") continue;
    if (!wantedKeys.has(key)) continue;
    out.push({ key, translation });
  }

  if (out.length === 0) {
    throw new Error("Auto-translate response contained no usable items");
  }
  return out;
}
