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
    return {
      provider: config.provider,
      model: config.provider === "deepl" ? "deepl" : config.model,
      items: [],
    };
  }

  try {
    // Translate in chunks so the model output stays well below
    // max_tokens — empirically a single batch of 270+ items blows past
    // the 4096-token cap and the LLM returns truncated JSON.
    // Chunks run sequentially to keep rate-limit pressure low; the
    // user-facing latency for a one-time fill is acceptable, and
    // sequential chunks let us short-circuit on the first error so a
    // bad call doesn't burn through the remaining keys.
    const chunkSize = providerChunkSize(config.provider);
    const allItems: AutoTranslateOutputItem[] = [];
    for (let i = 0; i < input.items.length; i += chunkSize) {
      const slice: AutoTranslateInput = {
        ...input,
        items: input.items.slice(i, i + chunkSize),
      };
      const chunkResult =
        config.provider === "anthropic"
          ? await translateViaAnthropic(slice, config.apiKey, config.model)
          : config.provider === "openai"
            ? await translateViaOpenAI(slice, config.apiKey, config.model)
            : await translateViaDeepL(slice, config.apiKey);
      allItems.push(...chunkResult);
    }
    return {
      provider: config.provider,
      model: config.provider === "deepl" ? "deepl" : config.model,
      items: allItems,
    };
  } catch (err) {
    await logError(err, {
      context: {
        feature: "auto-translate.batch",
        provider: config.provider,
        model: "model" in config ? config.model : "deepl",
        itemCount: input.items.length,
        targetLanguage: input.targetLanguageLabel,
      },
    });
    throw err;
  }
}

/**
 * Cap each API call's batch size so the response fits inside the
 * model's output window. Conservative defaults — the alternative is
 * the LLM truncating its JSON mid-stream and `parseAndValidate`
 * surfacing the unhelpful "non-JSON" error.
 */
function providerChunkSize(provider: "anthropic" | "openai" | "deepl"): number {
  switch (provider) {
    case "anthropic":
    case "openai":
      // ~40 short strings × ~80 tokens per item = comfortable within
      // 4–8K output tokens, with headroom for longer admin descriptions.
      return 40;
    case "deepl":
      // DeepL has no output-token budget per se, but very large batches
      // can hit per-request rate limits. 100 is well within their
      // recommended size.
      return 100;
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
    // Generous output budget so a chunk's JSON never gets truncated
    // mid-stream. 8K covers ~80–100 short translations even with long
    // values — well above our `providerChunkSize` of 40.
    max_tokens: 8192,
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
    // Explicit budget matching the Anthropic side — same reasoning:
    // a normal chunk has plenty of headroom, but without this we'd
    // inherit whatever the OpenAI default is and risk silent truncation.
    max_tokens: 8192,
  });

  const text = resp.choices[0]?.message?.content?.trim() ?? "";
  return parseAndValidate(text, input.items);
}

/**
 * DeepL — REST, no SDK. Free-tier keys end with `:fx` and use a
 * different host (`api-free.deepl.com`) from paid keys; the routing is
 * auto-detected so an admin can paste either kind of key and the call
 * goes to the right endpoint.
 *
 * DeepL doesn't have a per-item context channel that maps cleanly to
 * our per-key (`name`, `description`) hints — translations are produced
 * from the source text alone — but its free tier (500k chars / month)
 * makes it a useful no-cost backup. Translations come back in the same
 * order they were submitted, so we zip them back to the originating
 * keys without parsing.
 */
async function translateViaDeepL(
  input: AutoTranslateInput,
  apiKey: string,
): Promise<AutoTranslateOutputItem[]> {
  const isFree = apiKey.trim().endsWith(":fx");
  const url = isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
  const targetLang = toDeepLTargetLang(input.targetCountryCode, input.targetLanguageCode);

  // DeepL accepts an array of `text` values via repeated form params.
  // URLSearchParams handles repeated keys natively.
  const params = new URLSearchParams();
  for (const item of input.items) {
    params.append("text", item.sourceText);
  }
  params.set("target_lang", targetLang);
  params.set("preserve_formatting", "1");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    throw new Error(
      `DeepL API error ${resp.status}: ${bodyText.slice(0, 300) || resp.statusText}`,
    );
  }
  const data = (await resp.json()) as {
    translations: Array<{ detected_source_language?: string; text?: string }>;
  };
  if (!Array.isArray(data.translations) || data.translations.length === 0) {
    throw new Error("DeepL response contained no translations");
  }

  // Zip results back with our input keys. DeepL preserves input order.
  const out: AutoTranslateOutputItem[] = [];
  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const text = data.translations[i]?.text;
    if (item && typeof text === "string" && text.length > 0) {
      out.push({ key: item.key, translation: text });
    }
  }
  if (out.length === 0) {
    throw new Error("DeepL returned no usable items");
  }
  return out;
}

/**
 * Map our `(countryCode, languageCode)` pair to a DeepL target-language
 * code. DeepL expects uppercase ISO 639-1, with region variants for
 * a few languages where the locale matters (`EN-US`/`EN-GB`,
 * `PT-PT`/`PT-BR`).
 */
function toDeepLTargetLang(countryCode: string, languageCode: string): string {
  const lang = languageCode.trim().toUpperCase();
  const country = countryCode.trim().toUpperCase();
  if (lang === "EN") return country === "US" ? "EN-US" : "EN-GB";
  if (lang === "PT") return country === "BR" ? "PT-BR" : "PT-PT";
  return lang;
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
    // The most common "non-JSON" failure is the response getting cut off
    // mid-stream — the model hit max_tokens and the JSON ends with no
    // closing brace. Help the operator spot that by including the tail.
    const tail = cleaned.slice(-80);
    const headTail = cleaned.length > 200 ? `${cleaned.slice(0, 120)}…${tail}` : cleaned;
    const looksTruncated = !cleaned.trimEnd().endsWith("}");
    const hint = looksTruncated
      ? " (looks truncated — likely hit the model's max_tokens; try fewer items per batch)"
      : "";
    throw new Error(`Auto-translate returned non-JSON${hint}: ${headTail}`);
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
