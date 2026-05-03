import { prisma } from "@/lib/db";

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a value for safe inclusion inside HTML body text or attributes. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

export type TemplateVars = Record<string, string | number | null | undefined>;

/**
 * Registry of template keys the codebase actively renders. Listed in the
 * /super-admin/email-templates UI so admins know what they can override.
 * Falling back to a hard-coded version is the responsibility of each caller.
 */
export const KNOWN_TEMPLATES = [
  {
    key: "user_invitation",
    description: "Sent when a super admin creates a new user.",
    variables: ["name", "email", "password", "appUrl", "loginUrl"],
    hasFallback: true,
  },
  {
    key: "email_verification",
    description: "Sent after sign-up to confirm the user's email address.",
    variables: ["name", "email", "verifyUrl", "appUrl", "ttlMinutes"],
    hasFallback: true,
  },
  {
    key: "password_reset",
    description: "Sent when a user requests a password reset.",
    variables: ["name", "email", "resetUrl", "appUrl", "ttlMinutes"],
    hasFallback: true,
  },
  {
    key: "email_change_confirmation",
    description:
      "Sent to the new address when a logged-in user changes their email; confirming the link applies the change.",
    variables: ["name", "oldEmail", "newEmail", "confirmUrl", "appUrl", "ttlMinutes"],
    hasFallback: true,
  },
] as const;

export function renderTemplate(
  input: string,
  vars: TemplateVars,
  escape?: (s: string) => string,
): string {
  return input.replace(PLACEHOLDER, (match, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) return match;
    const s = String(v);
    return escape ? escape(s) : s;
  });
}

type RenderedTemplate = {
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
    // Vars in HTML bodies must be HTML-escaped so that user input (e.g. a
    // user's name containing < or > or quotes) can never inject markup into
    // the email. Admin-authored template HTML structure stays unescaped.
    html: tpl.bodyHtml ? renderTemplate(tpl.bodyHtml, vars, escapeHtml) : null,
  };
}
