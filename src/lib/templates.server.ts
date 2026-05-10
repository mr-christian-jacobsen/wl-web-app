import { prisma } from "@/lib/db";
import { getDefaultLanguageId } from "@/lib/languages";

import {
  escapeHtml,
  renderTemplate,
  type RenderedTemplate,
  type TemplateVars,
} from "@/lib/templates";

/**
 * Look up the admin-defined template for `key`, preferring the requested
 * language when given and falling through to the default-language row.
 *
 * Resolution order:
 *   1. `(key, languageId)` if `languageId` is provided.
 *   2. `(key, defaultLanguageId)` — always tried as the safety net.
 *   3. null — caller should render the hardcoded fallback.
 *
 * The default-language id is read lazily via `getDefaultLanguageId`,
 * which seeds the row on first call. That keeps the email pipeline
 * working on a brand-new database without a separate seed step.
 */
export async function renderTemplateByKey(
  key: string,
  vars: TemplateVars,
  languageId?: string,
): Promise<RenderedTemplate | null> {
  const tpl = await findTemplate(key, languageId);
  if (!tpl) return null;
  return {
    subject: renderTemplate(tpl.subject, vars),
    text: renderTemplate(tpl.bodyText, vars),
    html: tpl.bodyHtml ? renderTemplate(tpl.bodyHtml, vars, escapeHtml) : null,
  };
}

async function findTemplate(key: string, languageId: string | undefined) {
  if (languageId) {
    const direct = await prisma.emailTemplate.findUnique({
      where: { key_languageId: { key, languageId } },
    });
    if (direct) return direct;
  }

  const defaultId = await getDefaultLanguageId();
  // Skip the second query when the requested language *was* the default
  // — saves a round-trip on the most common code path.
  if (languageId === defaultId) return null;

  return prisma.emailTemplate.findUnique({
    where: { key_languageId: { key, languageId: defaultId } },
  });
}
