/**
 * Translation registry — the source of truth for which user-facing strings
 * exist in the codebase, what they default to in English, and a human-
 * readable note about where each one is used.
 *
 * Adding a new translatable string:
 *   1. Pick a stable key (dot-separated lowercase, e.g. "profile.title").
 *   2. Add an entry below with a clear `name` (what an admin will see in
 *      `/super-admin/translations` next to the key) and the English text
 *      in `defaultValue`.
 *   3. Reference the key from your component via `t("…")`.
 *
 * On boot, `syncTranslationKeys` (see `translations.server.ts`) upserts
 * every entry here into the `TranslationKey` table and inserts a
 * default-language row in `Translation` for any key that doesn't yet
 * have one — so adding a key in code and shipping is enough; admins
 * see it instantly without a separate seed step.
 *
 * Translation lookup chain (see `getTranslations`):
 *   requested-language row → default-language row → `defaultValue` →
 *   the key string itself. The last fallback is intentionally visible
 *   so missing entries surface in QA rather than silently rendering as
 *   blanks.
 *
 * Pure module — no Prisma imports — so it can be used from client
 * components and edge runtimes.
 */

export type TranslationKeyDef = {
  /** Dot-separated lowercase identifier, e.g. "profile.title". */
  key: string;
  /** Short admin-facing label, e.g. "Profile page title". */
  name: string;
  /** Optional longer hint about where the string appears. */
  description?: string;
  /** English text used when no DB row resolves. */
  defaultValue: string;
};

export type TranslationDict = Readonly<Record<string, string>>;

export const KNOWN_TRANSLATIONS: ReadonlyArray<TranslationKeyDef> = [
  // ─── Home (marketing landing) ────────────────────────────────────────────
  {
    key: "home.title",
    name: "Home — page title",
    description: "Large heading on the public landing page.",
    defaultValue: "wl-web-app",
  },
  {
    key: "home.tagline",
    name: "Home — tagline",
    description: "Paragraph under the title on the landing page.",
    defaultValue:
      "A responsive Node.js + TypeScript starter with sign-up, login, password reset, and a profile area for updating your name, email, password, and avatar.",
  },
  {
    key: "home.cta.go_to_profile",
    name: "Home — 'Go to profile' button (signed in)",
    defaultValue: "Go to profile",
  },
  {
    key: "home.cta.create_account",
    name: "Home — 'Create account' button (signed out)",
    defaultValue: "Create account",
  },
  {
    key: "home.cta.log_in",
    name: "Home — 'Log in' button (signed out)",
    defaultValue: "Log in",
  },

  // ─── AuthCard (shared shell for login/signup/etc.) ───────────────────────
  {
    key: "auth.back_home",
    name: "Auth pages — '← Back home' link",
    description: "Top-left link inside the auth card.",
    defaultValue: "← Back home",
  },

  // ─── Login ───────────────────────────────────────────────────────────────
  {
    key: "auth.login.title",
    name: "Login — page title",
    defaultValue: "Welcome back",
  },
  {
    key: "auth.login.subtitle",
    name: "Login — subtitle",
    defaultValue: "Sign in to manage your profile.",
  },
  {
    key: "auth.login.field.email",
    name: "Login — Email label",
    defaultValue: "Email",
  },
  {
    key: "auth.login.field.password",
    name: "Login — Password label",
    defaultValue: "Password",
  },
  {
    key: "auth.login.submit",
    name: "Login — Sign-in button label",
    defaultValue: "Sign in",
  },
  {
    key: "auth.login.submit_pending",
    name: "Login — Sign-in button label while submitting",
    defaultValue: "Signing in…",
  },
  {
    key: "auth.login.error.invalid",
    name: "Login — error shown for wrong email/password",
    defaultValue: "Invalid email or password",
  },
  {
    key: "auth.login.verify_prompt",
    name: "Login — hint shown under the error when unverified",
    description: "Followed by the 'Resend confirmation email' button.",
    defaultValue: "Just signed up? You may need to confirm your email first.",
  },
  {
    key: "auth.login.resend.idle",
    name: "Login — 'Resend confirmation email' button",
    defaultValue: "Resend confirmation email",
  },
  {
    key: "auth.login.resend.sending",
    name: "Login — resend button label while sending",
    defaultValue: "Sending…",
  },
  {
    key: "auth.login.resend.sent",
    name: "Login — resend button label after sending",
    defaultValue: "Confirmation sent — check your inbox.",
  },
  {
    key: "auth.login.footer.create_account",
    name: "Login — 'Create account' link in footer",
    defaultValue: "Create account",
  },
  {
    key: "auth.login.footer.forgot_password",
    name: "Login — 'Forgot password?' link in footer",
    defaultValue: "Forgot password?",
  },

  // ─── Signup ──────────────────────────────────────────────────────────────
  {
    key: "auth.signup.title",
    name: "Signup — page title",
    defaultValue: "Create your account",
  },
  {
    key: "auth.signup.subtitle",
    name: "Signup — subtitle",
    defaultValue: "Get started in under a minute.",
  },
  {
    key: "auth.signup.field.name",
    name: "Signup — Name label",
    defaultValue: "Name",
  },
  {
    key: "auth.signup.field.email",
    name: "Signup — Email label",
    defaultValue: "Email",
  },
  {
    key: "auth.signup.field.password",
    name: "Signup — Password label",
    defaultValue: "Password",
  },
  {
    key: "auth.signup.submit",
    name: "Signup — Create-account button label",
    defaultValue: "Create account",
  },
  {
    key: "auth.signup.submit_pending",
    name: "Signup — Create-account button label while submitting",
    defaultValue: "Creating account…",
  },
  {
    key: "auth.signup.error.generic",
    name: "Signup — generic error message",
    defaultValue: "Sign up failed",
  },
  {
    key: "auth.signup.success.heading",
    name: "Signup — success state heading",
    description:
      "Shown after successful submit; the user's email is interpolated into the message.",
    defaultValue: "Account created. We sent a confirmation link.",
  },
  {
    key: "auth.signup.success.body",
    name: "Signup — success state body",
    defaultValue: "Click the link in the email to activate your account, then sign in.",
  },
  {
    key: "auth.signup.success.resend_prompt",
    name: "Signup — 'Didn't receive it?' prompt",
    defaultValue: "Didn't receive it?",
  },
  {
    key: "auth.signup.resend.idle",
    name: "Signup — Resend button",
    defaultValue: "Resend",
  },
  {
    key: "auth.signup.resend.sending",
    name: "Signup — Resend button while sending",
    defaultValue: "Sending…",
  },
  {
    key: "auth.signup.resend.sent",
    name: "Signup — Resend button after sending",
    defaultValue: "Sent again.",
  },
  {
    key: "auth.signup.footer.have_account",
    name: "Signup — 'Already have an account?' footer line",
    defaultValue: "Already have an account?",
  },
  {
    key: "auth.signup.footer.sign_in",
    name: "Signup — 'Sign in' link in footer",
    defaultValue: "Sign in",
  },

  // ─── Forgot password ─────────────────────────────────────────────────────
  {
    key: "auth.forgot.title",
    name: "Forgot password — page title",
    defaultValue: "Reset your password",
  },
  {
    key: "auth.forgot.subtitle",
    name: "Forgot password — subtitle",
    defaultValue: "Enter the email associated with your account.",
  },
  {
    key: "auth.forgot.footer.back",
    name: "Forgot password — 'Back to sign in' link",
    defaultValue: "Back to sign in",
  },

  // ─── Reset password ──────────────────────────────────────────────────────
  {
    key: "auth.reset.title",
    name: "Reset password — page title",
    defaultValue: "Choose a new password",
  },
  {
    key: "auth.reset.subtitle",
    name: "Reset password — subtitle",
    defaultValue: "At least 8 characters.",
  },

  // ─── Profile page ────────────────────────────────────────────────────────
  {
    key: "profile.title",
    name: "Profile — page title",
    defaultValue: "Your profile",
  },
  {
    key: "profile.subtitle",
    name: "Profile — subtitle under the title",
    defaultValue: "Update your name, email, password, language, and avatar.",
  },
  {
    key: "profile.super_admin_link",
    name: "Profile — 'Super admin →' link in header",
    defaultValue: "Super admin →",
  },
  {
    key: "profile.section.avatar.title",
    name: "Profile — Avatar section title",
    defaultValue: "Profile image",
  },
  {
    key: "profile.section.avatar.description",
    name: "Profile — Avatar section description",
    defaultValue: "JPEG, PNG, or WebP. Max 2 MB.",
  },
  {
    key: "profile.section.avatar.upload",
    name: "Profile — Avatar upload button",
    defaultValue: "Upload new image",
  },
  {
    key: "profile.section.avatar.uploading",
    name: "Profile — Avatar upload button while uploading",
    defaultValue: "Uploading…",
  },
  {
    key: "profile.section.avatar.remove",
    name: "Profile — Avatar 'Remove' button",
    defaultValue: "Remove",
  },
  {
    key: "profile.section.avatar.remove_confirm",
    name: "Profile — Avatar removal confirmation prompt",
    defaultValue: "Remove your avatar?",
  },
  {
    key: "profile.section.details.title",
    name: "Profile — Account-details section title",
    defaultValue: "Account details",
  },
  {
    key: "profile.section.details.field.name",
    name: "Profile — Name field label",
    defaultValue: "Name",
  },
  {
    key: "profile.section.details.field.email",
    name: "Profile — Email field label",
    defaultValue: "Email",
  },
  {
    key: "profile.section.details.save",
    name: "Profile — Save-changes button label",
    defaultValue: "Save changes",
  },
  {
    key: "profile.section.details.saving",
    name: "Profile — Save-changes button while saving",
    defaultValue: "Saving…",
  },
  {
    key: "profile.section.appearance.title",
    name: "Profile — Appearance section title",
    defaultValue: "Appearance",
  },
  {
    key: "profile.section.appearance.description",
    name: "Profile — Appearance section description",
    defaultValue:
      "Choose how the app looks. Saved to your account, so it follows you on every device.",
  },
  {
    key: "profile.section.appearance.light",
    name: "Profile — Appearance 'Light' option",
    defaultValue: "Light",
  },
  {
    key: "profile.section.appearance.dark",
    name: "Profile — Appearance 'Dark' option",
    defaultValue: "Dark",
  },
  {
    key: "profile.section.appearance.system",
    name: "Profile — Appearance 'System' option",
    defaultValue: "System",
  },
  {
    key: "profile.section.language.title",
    name: "Profile — Language section title",
    defaultValue: "Language",
  },
  {
    key: "profile.section.language.description",
    name: "Profile — Language section description",
    defaultValue:
      "The language we use for emails and other notifications. Choose a specific language, or leave it blank to follow the site default.",
  },
  {
    key: "profile.section.language.field",
    name: "Profile — 'Preferred language' field label",
    defaultValue: "Preferred language",
  },
  {
    key: "profile.section.language.site_default",
    name: "Profile — 'Site default' option in language dropdown",
    defaultValue: "Site default",
  },
  {
    key: "profile.section.language.save",
    name: "Profile — Save language button",
    defaultValue: "Save language",
  },
  {
    key: "profile.section.password.title",
    name: "Profile — Change-password section title",
    defaultValue: "Change password",
  },
  {
    key: "profile.section.password.description",
    name: "Profile — Change-password section description",
    defaultValue: "You'll need your current password to confirm.",
  },
  {
    key: "profile.section.password.current",
    name: "Profile — Current-password field label",
    defaultValue: "Current password",
  },
  {
    key: "profile.section.password.new",
    name: "Profile — New-password field label",
    defaultValue: "New password",
  },
  {
    key: "profile.section.password.update",
    name: "Profile — Update-password button",
    defaultValue: "Update password",
  },
  {
    key: "profile.section.password.updating",
    name: "Profile — Update-password button while updating",
    defaultValue: "Updating…",
  },
  {
    key: "profile.section.signout.title",
    name: "Profile — Sign-out section title",
    defaultValue: "Sign out",
  },
  {
    key: "profile.section.signout.button",
    name: "Profile — Sign-out button",
    defaultValue: "Sign out",
  },

  // ─── Super admin shared nav ──────────────────────────────────────────────
  {
    key: "super_admin.eyebrow",
    name: "Super admin — small 'Super admin' label above the title",
    defaultValue: "Super admin",
  },
  {
    key: "super_admin.title",
    name: "Super admin — main page title",
    defaultValue: "Administration",
  },
  {
    key: "super_admin.nav.overview",
    name: "Super admin nav — Overview",
    defaultValue: "Overview",
  },
  {
    key: "super_admin.nav.users",
    name: "Super admin nav — Users",
    defaultValue: "Users",
  },
  {
    key: "super_admin.nav.surveys",
    name: "Super admin nav — Surveys",
    defaultValue: "Surveys",
  },
  {
    key: "super_admin.nav.languages",
    name: "Super admin nav — Languages",
    defaultValue: "Languages",
  },
  {
    key: "super_admin.nav.email_templates",
    name: "Super admin nav — Email templates",
    defaultValue: "Email templates",
  },
  {
    key: "super_admin.nav.emails",
    name: "Super admin nav — Emails",
    defaultValue: "Emails",
  },
  {
    key: "super_admin.nav.usage",
    name: "Super admin nav — Usage",
    defaultValue: "Usage",
  },
  {
    key: "super_admin.nav.errors",
    name: "Super admin nav — Errors",
    defaultValue: "Errors",
  },
  {
    key: "super_admin.nav.translations",
    name: "Super admin nav — Translations",
    defaultValue: "Translations",
  },
  {
    key: "super_admin.nav.system_settings",
    name: "Super admin nav — System settings",
    defaultValue: "System settings",
  },
  {
    key: "super_admin.nav.back_to_profile",
    name: "Super admin nav — '← Back to profile' link",
    defaultValue: "← Back to profile",
  },

  // ─── Super admin overview tiles ──────────────────────────────────────────
  {
    key: "super_admin.overview.stat.total_users",
    name: "Overview — 'Total users' tile label",
    defaultValue: "Total users",
  },
  {
    key: "super_admin.overview.stat.super_admins",
    name: "Overview — 'Super admins' tile label",
    defaultValue: "Super admins",
  },
  {
    key: "super_admin.overview.stat.email_templates",
    name: "Overview — 'Email templates' tile label",
    defaultValue: "Email templates",
  },
  {
    key: "super_admin.overview.stat.sessions_24h",
    name: "Overview — 'Sessions (24h)' tile label",
    defaultValue: "Sessions (24h)",
  },
  {
    key: "super_admin.overview.stat.emails_24h",
    name: "Overview — 'Emails (24h)' tile label",
    defaultValue: "Emails (24h)",
  },
  {
    key: "super_admin.overview.stat.errors_24h",
    name: "Overview — 'Errors (24h)' tile label",
    defaultValue: "Errors (24h)",
  },
  {
    key: "super_admin.overview.quick_links.title",
    name: "Overview — 'Quick links' card title",
    defaultValue: "Quick links",
  },
  {
    key: "super_admin.overview.quick_links.manage_users",
    name: "Overview — 'Manage users →' link",
    defaultValue: "Manage users →",
  },
  {
    key: "super_admin.overview.quick_links.manage_email_templates",
    name: "Overview — 'Manage email templates →' link",
    defaultValue: "Manage email templates →",
  },

  // ─── Super admin / Translations page ─────────────────────────────────────
  {
    key: "super_admin.translations.title",
    name: "Translations — page title",
    defaultValue: "Translations",
  },
  {
    key: "super_admin.translations.description",
    name: "Translations — page description",
    defaultValue:
      "Edit user-facing text per language. Devs add new keys in code; admins translate them here.",
  },
  {
    key: "super_admin.translations.language_label",
    name: "Translations — 'Language' picker label",
    defaultValue: "Language",
  },
  {
    key: "super_admin.translations.search_placeholder",
    name: "Translations — search field placeholder",
    defaultValue: "Search by key, name or value…",
  },
  {
    key: "super_admin.translations.sync_button",
    name: "Translations — 'Sync from code' button",
    defaultValue: "Sync from code",
  },
  {
    key: "super_admin.translations.col.key",
    name: "Translations — table column header for the key",
    defaultValue: "Key",
  },
  {
    key: "super_admin.translations.col.name",
    name: "Translations — table column header for the human-readable name",
    defaultValue: "Name",
  },
  {
    key: "super_admin.translations.col.value",
    name: "Translations — table column header for the value",
    defaultValue: "Value",
  },
  {
    key: "super_admin.translations.save",
    name: "Translations — inline save button",
    defaultValue: "Save",
  },
  {
    key: "super_admin.translations.saving",
    name: "Translations — inline save button while saving",
    defaultValue: "Saving…",
  },
  {
    key: "super_admin.translations.saved",
    name: "Translations — confirmation chip after save",
    defaultValue: "Saved",
  },
  {
    key: "super_admin.translations.fallback_notice",
    name: "Translations — placeholder shown for blank values",
    description: "Visible when a row has no DB value yet and falls back to the default-language value.",
    defaultValue: "(using default-language value)",
  },
  {
    key: "super_admin.translations.empty",
    name: "Translations — empty-state message after a search",
    defaultValue: "No translation keys match your search.",
  },

  // ─── Auto-translate (per-row + bulk) ─────────────────────────────────────
  {
    key: "super_admin.translations.auto.heading",
    name: "Translations — auto-translate toolbar heading",
    description: "Shown above the bulk auto-translate buttons.",
    defaultValue: "Auto-translate every missing value into this language:",
  },
  {
    key: "super_admin.translations.auto.missing_review",
    name: "Translations — 'Translate missing (review)' bulk button",
    description: "Fills empty rows with suggestions; admin reviews and saves manually.",
    defaultValue: "Translate missing (review)",
  },
  {
    key: "super_admin.translations.auto.missing_commit",
    name: "Translations — 'Translate missing & save' bulk button",
    description: "Translates and persists in one step with source=auto.",
    defaultValue: "Translate missing & save",
  },
  {
    key: "super_admin.translations.auto.translate_row",
    name: "Translations — per-row 'Translate' button",
    defaultValue: "Translate",
  },
  {
    key: "super_admin.translations.auto.translating",
    name: "Translations — per-row Translate button while translating",
    defaultValue: "Translating…",
  },
  {
    key: "super_admin.translations.auto.running",
    name: "Translations — bulk button label while translating",
    defaultValue: "Translating…",
  },
  {
    key: "super_admin.translations.auto.review_ok",
    name: "Translations — toast after bulk review-mode succeeds",
    defaultValue: "Suggestions filled in. Review and click Save on each row.",
  },
  {
    key: "super_admin.translations.auto.commit_ok",
    name: "Translations — toast after bulk commit-mode succeeds",
    defaultValue: "Translated and saved.",
  },
  {
    key: "super_admin.translations.auto.suggestion_badge",
    name: "Translations — chip on a row showing an unsaved AI suggestion",
    defaultValue: "🤖 auto-translated (review)",
  },
  {
    key: "super_admin.translations.auto.saved_badge",
    name: "Translations — chip on a row whose saved value came from auto-translate",
    defaultValue: "🤖 auto",
  },

  // ─── Translate-provider settings form ────────────────────────────────────
  {
    key: "super_admin.translate_provider.title",
    name: "System settings — translate-provider section title",
    defaultValue: "Auto-translate provider",
  },
  {
    key: "super_admin.translate_provider.description",
    name: "System settings — translate-provider section description",
    defaultValue:
      "Which AI service translates UI strings when an admin clicks the auto-translate buttons. API keys are stored encrypted; leave a key field blank to keep the existing value.",
  },
  {
    key: "super_admin.translate_provider.field.provider",
    name: "Translate provider — 'Provider' field label",
    defaultValue: "Provider",
  },
  {
    key: "super_admin.translate_provider.field.model",
    name: "Translate provider — 'Model' field label",
    defaultValue: "Model",
  },
  {
    key: "super_admin.translate_provider.field.api_key",
    name: "Translate provider — 'API key' field label",
    defaultValue: "API key",
  },
  {
    key: "super_admin.translate_provider.api_key.set_placeholder",
    name: "Translate provider — placeholder when a key IS configured",
    defaultValue: "Configured — leave blank to keep",
  },
  {
    key: "super_admin.translate_provider.api_key.unset_placeholder",
    name: "Translate provider — placeholder when no key is configured",
    defaultValue: "Not set",
  },
  {
    key: "super_admin.translate_provider.clear_button",
    name: "Translate provider — 'Clear key' button",
    defaultValue: "Clear key",
  },
  {
    key: "super_admin.translate_provider.clear_confirm",
    name: "Translate provider — confirm prompt before clearing a key",
    defaultValue: "Clear the stored API key? Auto-translate will stop working until you re-add one.",
  },
  {
    key: "super_admin.translate_provider.save",
    name: "Translate provider — Save button",
    defaultValue: "Save provider settings",
  },
];

const TRANSLATIONS_BY_KEY = new Map(KNOWN_TRANSLATIONS.map((t) => [t.key, t]));

/** Look up a registry entry by key; `undefined` for unknown keys. */
export function getKnownTranslation(key: string): TranslationKeyDef | undefined {
  return TRANSLATIONS_BY_KEY.get(key);
}

/**
 * Resolve a single key against a loaded dict, with the same fallback
 * chain `getTranslations` builds for full dictionaries: dict value →
 * registry default → key string. Useful when a component holds a partial
 * dict and looks up keys one at a time.
 */
export function translate(dict: TranslationDict, key: string): string {
  const fromDict = dict[key];
  if (typeof fromDict === "string" && fromDict.length > 0) return fromDict;
  const def = TRANSLATIONS_BY_KEY.get(key);
  if (def) return def.defaultValue;
  return key;
}
