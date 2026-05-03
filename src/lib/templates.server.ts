import { prisma } from "@/lib/db";

import {
  escapeHtml,
  renderTemplate,
  type RenderedTemplate,
  type TemplateVars,
} from "@/lib/templates";

/** Render the admin-defined template for `key` if one exists in the DB. */
export async function renderTemplateByKey(
  key: string,
  vars: TemplateVars,
): Promise<RenderedTemplate | null> {
  const tpl = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!tpl) return null;
  return {
    subject: renderTemplate(tpl.subject, vars),
    text: renderTemplate(tpl.bodyText, vars),
    html: tpl.bodyHtml ? renderTemplate(tpl.bodyHtml, vars, escapeHtml) : null,
  };
}
