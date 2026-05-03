import { prisma } from "@/lib/db";

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export type TemplateVars = Record<string, string | number | null | undefined>;

export function renderTemplate(input: string, vars: TemplateVars): string {
  return input.replace(PLACEHOLDER, (match, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? match : String(v);
  });
}

export type RenderedTemplate = {
  subject: string;
  text: string;
  html: string | null;
};

export async function renderTemplateByKey(
  key: string,
  vars: TemplateVars,
): Promise<RenderedTemplate | null> {
  const tpl = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!tpl) return null;
  return {
    subject: renderTemplate(tpl.subject, vars),
    text: renderTemplate(tpl.bodyText, vars),
    html: tpl.bodyHtml ? renderTemplate(tpl.bodyHtml, vars) : null,
  };
}
