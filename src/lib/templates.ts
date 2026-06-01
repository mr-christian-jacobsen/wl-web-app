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

export type RenderedTemplate = {
  subject: string;
  text: string;
  html: string | null;
};

/**
 * Registry of template keys the codebase actively renders. Each entry carries
 * its built-in fallback so the same copy is rendered in production (when no
 * admin-defined template exists) and previewed in /super-admin/email-templates.
 */
export const KNOWN_TEMPLATES = [
  {
    key: "user_invitation",
    description: "Sent when a super admin creates a new user.",
    variables: ["name", "email", "password", "appUrl", "loginUrl"],
    fallback: {
      subject: "Your wl-web-app account is ready",
      bodyText:
        "Hi {{name}},\n\n" +
        "An account has been created for you on wl-web-app.\n\n" +
        "Sign in at: {{loginUrl}}\n" +
        "Email: {{email}}\n" +
        "Temporary password: {{password}}\n\n" +
        "For security, change your password after signing in.",
      bodyHtml:
        '<p>Hi {{name}},</p>\n' +
        "<p>An account has been created for you on wl-web-app.</p>\n" +
        '<p>Sign in at <a href="{{loginUrl}}">{{loginUrl}}</a></p>\n' +
        "<ul>\n" +
        "  <li>Email: <code>{{email}}</code></li>\n" +
        "  <li>Temporary password: <code>{{password}}</code></li>\n" +
        "</ul>\n" +
        "<p>For security, change your password after signing in.</p>",
    },
    sampleVars: {
      name: "Alex Doe",
      email: "alex@example.com",
      password: "TempPa55!",
      appUrl: "http://localhost:3010",
      loginUrl: "http://localhost:3010/login",
    },
  },
  {
    key: "email_verification",
    description: "Sent after sign-up to confirm the user's email address.",
    variables: ["name", "email", "verifyUrl", "appUrl", "ttlMinutes"],
    fallback: {
      subject: "Confirm your email address",
      bodyText:
        "Welcome, {{name}}!\n\n" +
        "Confirm your email by visiting:\n" +
        "{{verifyUrl}}\n\n" +
        "This link expires in 24 hours. If you did not create an account, ignore this email.",
      bodyHtml:
        "<p>Welcome, {{name}}!</p>\n" +
        '<p>Confirm your email by clicking <a href="{{verifyUrl}}">{{verifyUrl}}</a>.</p>\n' +
        "<p>This link expires in 24 hours. If you did not create an account, ignore this email.</p>",
    },
    sampleVars: {
      name: "Alex Doe",
      email: "alex@example.com",
      verifyUrl: "http://localhost:3010/verify-email/k4n3l2m9c8x7v6b5n4m3",
      appUrl: "http://localhost:3010",
      ttlMinutes: 1440,
    },
  },
  {
    key: "password_reset",
    description: "Sent when a user requests a password reset.",
    variables: ["name", "email", "resetUrl", "appUrl", "ttlMinutes"],
    fallback: {
      subject: "Reset your password",
      bodyText:
        "Reset your password by visiting: {{resetUrl}}\n\n" +
        "This link expires in {{ttlMinutes}} minutes. If you did not request this, ignore this email.",
      bodyHtml:
        "<p>Reset your password by clicking the link below:</p>\n" +
        '<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>\n' +
        "<p>This link expires in {{ttlMinutes}} minutes. If you did not request this, ignore this email.</p>",
    },
    sampleVars: {
      name: "Alex Doe",
      email: "alex@example.com",
      resetUrl: "http://localhost:3010/reset-password/k4n3l2m9c8x7v6b5n4m3",
      appUrl: "http://localhost:3010",
      ttlMinutes: 30,
    },
  },
  {
    key: "email_change_confirmation",
    description:
      "Sent to the new address when a logged-in user changes their email; confirming the link applies the change.",
    variables: ["name", "oldEmail", "newEmail", "confirmUrl", "appUrl", "ttlMinutes"],
    fallback: {
      subject: "Confirm your new email address",
      bodyText:
        "Hi {{name}},\n\n" +
        "You (or someone using your account) asked to change the email on file from {{oldEmail}} to this address.\n\n" +
        "Confirm the change by visiting:\n" +
        "{{confirmUrl}}\n\n" +
        "This link expires in 24 hours. If you didn't request this, ignore this email — your account stays on {{oldEmail}}.",
      bodyHtml:
        "<p>Hi {{name}},</p>\n" +
        "<p>You (or someone using your account) asked to change the email on file from <code>{{oldEmail}}</code> to this address.</p>\n" +
        '<p>Confirm the change by clicking <a href="{{confirmUrl}}">{{confirmUrl}}</a>.</p>\n' +
        "<p>This link expires in 24 hours. If you didn't request this, ignore this email — your account stays on <code>{{oldEmail}}</code>.</p>",
    },
    sampleVars: {
      name: "Alex Doe",
      oldEmail: "alex.old@example.com",
      newEmail: "alex@example.com",
      confirmUrl: "http://localhost:3010/verify-email/k4n3l2m9c8x7v6b5n4m3",
      appUrl: "http://localhost:3010",
      ttlMinutes: 1440,
    },
  },
] as const;

export type KnownTemplateKey = (typeof KNOWN_TEMPLATES)[number]["key"];

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

/** Render the built-in fallback for a known template key. */
export function renderFallback(
  key: string,
  vars: TemplateVars,
): RenderedTemplate | null {
  const tpl = KNOWN_TEMPLATES.find((t) => t.key === key);
  if (!tpl) return null;
  return {
    subject: renderTemplate(tpl.fallback.subject, vars),
    text: renderTemplate(tpl.fallback.bodyText, vars),
    // Vars in HTML bodies are HTML-escaped so user-supplied values can never
    // inject markup; the fallback's own tags are left intact.
    html: renderTemplate(tpl.fallback.bodyHtml, vars, escapeHtml),
  };
}
