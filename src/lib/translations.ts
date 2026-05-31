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
    key: "super_admin.nav.tags",
    name: "Super admin nav — Tags",
    defaultValue: "Tags",
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
    key: "super_admin.nav.api_docs",
    name: "Super admin nav — API docs",
    defaultValue: "API docs",
  },
  {
    key: "super_admin.nav.docs_solutions",
    name: "Super admin nav — Documented solutions",
    defaultValue: "Solutions",
  },
  {
    key: "super_admin.docs_solutions.title",
    name: "Docs/solutions page — title",
    defaultValue: "Documented solutions",
  },
  {
    key: "super_admin.docs_solutions.description",
    name: "Docs/solutions page — subtitle below the title",
    defaultValue:
      "Browse the engineering-learnings knowledge store. Read-only view of docs/solutions/ with filters over problem type, status, and tags.",
  },
  {
    key: "super_admin.docs_solutions.filters.all_problem_types",
    name: "Docs/solutions filters — 'All problem types' default option",
    defaultValue: "All problem types",
  },
  {
    key: "super_admin.docs_solutions.filters.all_statuses",
    name: "Docs/solutions filters — 'All statuses' default option",
    defaultValue: "All statuses",
  },
  {
    key: "super_admin.docs_solutions.filters.clear_tags",
    name: "Docs/solutions filters — 'Clear tag filters' button",
    defaultValue: "Clear tags",
  },
  {
    key: "super_admin.docs_solutions.filters.tags_label",
    name: "Docs/solutions filters — label above the tag chips",
    defaultValue: "Tags",
  },
  {
    key: "super_admin.docs_solutions.empty",
    name: "Docs/solutions table — message shown when no rows match the active filters",
    defaultValue: "No docs match the current filters.",
  },
  {
    key: "super_admin.docs_solutions.column.id",
    name: "Docs/solutions table — ID column header",
    defaultValue: "ID",
  },
  {
    key: "super_admin.docs_solutions.column.title",
    name: "Docs/solutions table — Title column header",
    defaultValue: "Title",
  },
  {
    key: "super_admin.docs_solutions.column.category",
    name: "Docs/solutions table — Category column header",
    defaultValue: "Category",
  },
  {
    key: "super_admin.docs_solutions.column.problem_type",
    name: "Docs/solutions table — Problem type column header",
    defaultValue: "Problem type",
  },
  {
    key: "super_admin.docs_solutions.column.status",
    name: "Docs/solutions table — Status column header",
    defaultValue: "Status",
  },
  {
    key: "super_admin.docs_solutions.column.tags",
    name: "Docs/solutions table — Tags column header",
    defaultValue: "Tags",
  },
  {
    key: "super_admin.docs_solutions.column.date",
    name: "Docs/solutions table — Date column header",
    defaultValue: "Date",
  },
  {
    key: "super_admin.docs_solutions.column.source",
    name: "Docs/solutions table — Source link column header",
    defaultValue: "Source",
  },
  {
    key: "super_admin.docs_solutions.supersedes.label",
    name: "Docs/solutions table — prefix for 'Supersedes [id, id]' inline note",
    defaultValue: "Supersedes",
  },
  {
    key: "super_admin.docs_solutions.superseded_by.label",
    name: "Docs/solutions table — prefix for 'Superseded by [id]' inline note",
    defaultValue: "Superseded by",
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
  {
    key: "super_admin.translate_provider.deepl.hint",
    name: "Translate provider — DeepL help text under the API-key field",
    description:
      "Explains that DeepL has no model selector and that the free vs paid endpoint is auto-detected from the key.",
    defaultValue:
      "Free-tier keys end with “:fx” and are auto-routed to api-free.deepl.com. DeepL has no per-item context channel, so quality on short UI labels can be a step behind Anthropic/OpenAI.",
  },

  // ─── Shared admin atoms ──────────────────────────────────────────────────
  { key: "admin.action.edit", name: "Generic 'Edit' button", defaultValue: "Edit" },
  { key: "admin.action.delete", name: "Generic 'Delete' button", defaultValue: "Delete" },
  { key: "admin.action.cancel", name: "Generic 'Cancel' button", defaultValue: "Cancel" },
  { key: "admin.action.close", name: "Generic 'Close' button (dialogs)", defaultValue: "Close" },
  { key: "admin.action.save", name: "Generic 'Save' button", defaultValue: "Save" },
  { key: "admin.action.saving", name: "Generic 'Saving…' button label", defaultValue: "Saving…" },
  { key: "admin.action.deleting", name: "Generic 'Deleting…' button label", defaultValue: "Deleting…" },
  { key: "admin.action.dismiss", name: "Generic 'Dismiss' button (error/notice banners)", defaultValue: "Dismiss" },
  { key: "admin.you_chip", name: "Chip shown next to the current user's row", defaultValue: "you" },

  // ─── Users page ──────────────────────────────────────────────────────────
  { key: "super_admin.users.title", name: "Users — page title", defaultValue: "Users" },
  {
    key: "super_admin.users.total",
    name: "Users — '{n} total' counter",
    description: "{n} is replaced with the row count.",
    defaultValue: "{n} total",
  },
  { key: "super_admin.users.new", name: "Users — '+ New user' button", defaultValue: "+ New user" },
  { key: "super_admin.users.col.email", name: "Users — Email column header", defaultValue: "Email" },
  { key: "super_admin.users.col.name", name: "Users — Name column header", defaultValue: "Name" },
  { key: "super_admin.users.col.language", name: "Users — Language column header", defaultValue: "Language" },
  { key: "super_admin.users.col.super_admin", name: "Users — Super admin column header", defaultValue: "Super admin" },
  { key: "super_admin.users.col.created", name: "Users — Created column header", defaultValue: "Created" },
  { key: "super_admin.users.col.actions", name: "Users — Actions column header", defaultValue: "Actions" },
  { key: "super_admin.users.language.default", name: "Users — 'Default' shown when no language is set", defaultValue: "Default" },
  { key: "super_admin.users.is_super.yes", name: "Users — 'Yes' shown when isSuperAdmin = true", defaultValue: "Yes" },
  { key: "super_admin.users.is_super.no", name: "Users — 'No' shown when isSuperAdmin = false", defaultValue: "No" },
  { key: "super_admin.users.empty", name: "Users — empty state when no rows", defaultValue: "No users yet." },
  { key: "super_admin.users.delete_self_error", name: "Users — error when trying to self-delete", defaultValue: "You can't delete your own account here." },
  {
    key: "super_admin.users.delete_confirm",
    name: "Users — delete confirmation prompt",
    description: "{email} is replaced with the target user's address.",
    defaultValue: "Delete {email}? This cannot be undone.",
  },
  { key: "super_admin.users.delete_failed", name: "Users — error toast when delete fails", defaultValue: "Delete failed" },
  // Dialog
  { key: "super_admin.users.dialog.create_title", name: "User dialog — title in create mode", defaultValue: "Create user" },
  { key: "super_admin.users.dialog.edit_title", name: "User dialog — title in edit mode", defaultValue: "Edit user" },
  {
    key: "super_admin.users.dialog.invite_hint",
    name: "User dialog — explanation under the create form",
    description: "Tells admins that an invitation email will be sent and points at /super-admin/email-templates.",
    defaultValue:
      "On create, the user_invitation email is sent to the new user. Customise it at /super-admin/email-templates; if no template is defined, a built-in fallback is used.",
  },
  { key: "super_admin.users.dialog.password", name: "User dialog — Password label (create)", defaultValue: "Password" },
  { key: "super_admin.users.dialog.password_edit", name: "User dialog — Password label (edit; keep blank to retain)", defaultValue: "New password (leave blank to keep current)" },
  { key: "super_admin.users.dialog.site_default", name: "User dialog — Language select 'Site default' option", defaultValue: "Site default" },
  { key: "super_admin.users.dialog.super_admin_checkbox", name: "User dialog — Super-admin checkbox label", defaultValue: "Super admin" },
  { key: "super_admin.users.dialog.create_submit", name: "User dialog — Create submit button", defaultValue: "Create user" },
  { key: "super_admin.users.dialog.edit_submit", name: "User dialog — Edit submit button", defaultValue: "Save changes" },
  { key: "super_admin.users.dialog.create_failed", name: "User dialog — error fallback when create fails", defaultValue: "Create failed" },
  { key: "super_admin.users.dialog.update_failed", name: "User dialog — error fallback when update fails", defaultValue: "Update failed" },

  // ─── Languages page ──────────────────────────────────────────────────────
  { key: "super_admin.languages.title", name: "Languages — page title", defaultValue: "Languages" },
  { key: "super_admin.languages.description", name: "Languages — page description", defaultValue: "Manage the languages your app supports. Pick a country, then a language if the country has more than one official language." },
  { key: "super_admin.languages.empty", name: "Languages — empty state", defaultValue: "No languages yet." },
  {
    key: "super_admin.languages.count",
    name: "Languages — count summary",
    description: "{n} is replaced with the row count, {plural} with empty or 's'.",
    defaultValue: "{n} language{plural}",
  },
  { key: "super_admin.languages.new", name: "Languages — 'New language' button", defaultValue: "New language" },
  { key: "super_admin.languages.field.country", name: "Languages — Country field label", defaultValue: "Country" },
  { key: "super_admin.languages.field.language", name: "Languages — Language field label", defaultValue: "Language" },
  { key: "super_admin.languages.field.country_placeholder", name: "Languages — Country select placeholder", defaultValue: "Select a country…" },
  { key: "super_admin.languages.field.language_placeholder", name: "Languages — Language select placeholder", defaultValue: "Select a language…" },
  { key: "super_admin.languages.auto_lang_prefix", name: "Languages — prefix on the 'Language: X' line when there's only one", defaultValue: "Language:" },
  { key: "super_admin.languages.error.pick_country", name: "Languages — error if no country picked", defaultValue: "Pick a country" },
  { key: "super_admin.languages.error.pick_language", name: "Languages — error if no language picked", defaultValue: "Pick a language" },
  { key: "super_admin.languages.error.add_failed", name: "Languages — add-failed error", defaultValue: "Could not add language" },
  { key: "super_admin.languages.error.delete_failed", name: "Languages — delete-failed error", defaultValue: "Could not delete language" },
  { key: "super_admin.languages.add", name: "Languages — 'Add language' submit button", defaultValue: "Add language" },
  { key: "super_admin.languages.adding", name: "Languages — submit button while adding", defaultValue: "Adding…" },
  {
    key: "super_admin.languages.delete_confirm",
    name: "Languages — delete confirmation",
    description: "{label} is replaced with the locale label.",
    defaultValue: "Delete {label}?",
  },
  { key: "super_admin.languages.default_badge", name: "Languages — 'Default' badge on the seeded row", defaultValue: "Default" },
  { key: "super_admin.languages.locked_label", name: "Languages — 'Locked' label on the default row (can't delete)", defaultValue: "Locked" },
  { key: "super_admin.languages.locked_title", name: "Languages — tooltip on the Locked label", defaultValue: "The default language cannot be deleted" },

  // ─── Email templates page ────────────────────────────────────────────────
  { key: "super_admin.email_templates.title", name: "Email templates — page title", defaultValue: "Email templates" },
  { key: "super_admin.email_templates.description", name: "Email templates — page description", defaultValue: "Override the transactional emails for each language. Variables in templates use {{name}} style." },
  { key: "super_admin.email_templates.new", name: "Email templates — New button", defaultValue: "New template" },
  { key: "super_admin.email_templates.add_translation", name: "Email templates — 'Add translation' button on a key group", defaultValue: "Add translation" },
  { key: "super_admin.email_templates.empty", name: "Email templates — empty state", defaultValue: "No templates yet. The built-in fallbacks will be used for every email." },
  { key: "super_admin.email_templates.col.key", name: "Email templates — Key column", defaultValue: "Key" },
  { key: "super_admin.email_templates.col.name", name: "Email templates — Name column", defaultValue: "Name" },
  { key: "super_admin.email_templates.col.language", name: "Email templates — Language column", defaultValue: "Language" },
  { key: "super_admin.email_templates.col.updated", name: "Email templates — Updated column", defaultValue: "Updated" },
  { key: "super_admin.email_templates.field.key", name: "Email templates dialog — Key field label", defaultValue: "Key" },
  { key: "super_admin.email_templates.field.language", name: "Email templates dialog — Language field label", defaultValue: "Language" },
  { key: "super_admin.email_templates.field.name", name: "Email templates dialog — Name field label", defaultValue: "Name" },
  { key: "super_admin.email_templates.field.subject", name: "Email templates dialog — Subject field label", defaultValue: "Subject" },
  { key: "super_admin.email_templates.field.body_text", name: "Email templates dialog — Plain-text body field", defaultValue: "Plain-text body" },
  { key: "super_admin.email_templates.field.body_html", name: "Email templates dialog — HTML body field", defaultValue: "HTML body (optional)" },
  { key: "super_admin.email_templates.field.description", name: "Email templates dialog — Description field", defaultValue: "Description (optional)" },
  { key: "super_admin.email_templates.dialog.create_title", name: "Email templates dialog — create-mode title", defaultValue: "New template" },
  { key: "super_admin.email_templates.dialog.edit_title", name: "Email templates dialog — edit-mode title", defaultValue: "Edit template" },
  { key: "super_admin.email_templates.dialog.create", name: "Email templates dialog — Create submit", defaultValue: "Create" },
  { key: "super_admin.email_templates.dialog.save", name: "Email templates dialog — Save submit", defaultValue: "Save changes" },
  { key: "super_admin.email_templates.delete_confirm", name: "Email templates — delete confirmation", defaultValue: "Delete this template?" },
  { key: "super_admin.email_templates.delete_failed", name: "Email templates — delete-failed error", defaultValue: "Delete failed" },

  // ─── Emails page ─────────────────────────────────────────────────────────
  { key: "super_admin.emails.title", name: "Emails — page title", defaultValue: "Emails" },
  {
    key: "super_admin.emails.showing",
    name: "Emails — 'Showing N most recent' header",
    description: "{n} is replaced with the row count.",
    defaultValue: "Showing {n} most recent",
  },
  { key: "super_admin.emails.col.time", name: "Emails — Time column", defaultValue: "Time" },
  { key: "super_admin.emails.col.to", name: "Emails — To column", defaultValue: "To" },
  { key: "super_admin.emails.col.type", name: "Emails — Type column", defaultValue: "Type" },
  { key: "super_admin.emails.col.subject", name: "Emails — Subject column", defaultValue: "Subject" },
  { key: "super_admin.emails.col.status", name: "Emails — Status column", defaultValue: "Status" },
  { key: "super_admin.emails.empty", name: "Emails — empty state", defaultValue: "No emails sent yet." },
  { key: "super_admin.emails.fallback_badge", name: "Emails — 'fallback' badge when no admin template was used", defaultValue: "fallback" },
  { key: "super_admin.emails.user_prefix", name: "Emails — 'user:' label for mismatched recipient", defaultValue: "user:" },
  { key: "super_admin.emails.resend", name: "Emails — Resend button", defaultValue: "Resend" },
  { key: "super_admin.emails.resending", name: "Emails — Resend button while sending", defaultValue: "Resending…" },
  { key: "super_admin.emails.resend_failed", name: "Emails — resend-failed error", defaultValue: "Resend failed" },
  { key: "super_admin.emails.dialog.to", name: "Emails dialog — 'To' label", defaultValue: "To" },
  { key: "super_admin.emails.dialog.user", name: "Emails dialog — 'User' label", defaultValue: "User" },
  { key: "super_admin.emails.dialog.sent_at", name: "Emails dialog — 'Sent at' label", defaultValue: "Sent at" },
  { key: "super_admin.emails.dialog.template_key", name: "Emails dialog — 'Template key' label", defaultValue: "Template key" },
  { key: "super_admin.emails.dialog.template_fallback", name: "Emails dialog — built-in fallback hint", defaultValue: "— (built-in fallback)" },
  { key: "super_admin.emails.dialog.error", name: "Emails dialog — 'Error' label", defaultValue: "Error" },
  { key: "super_admin.emails.tab.html", name: "Emails dialog — HTML tab", defaultValue: "HTML" },
  { key: "super_admin.emails.tab.text", name: "Emails dialog — Plain-text tab", defaultValue: "Plain text" },
  { key: "super_admin.emails.no_html_body", name: "Emails dialog — placeholder when no HTML body exists", defaultValue: "No HTML body — only the plain-text version was sent." },
  // Email type labels (rendered from the `type` enum column)
  { key: "super_admin.emails.type.user_invitation", name: "Email type — user invitation", defaultValue: "User invitation" },
  { key: "super_admin.emails.type.email_verification", name: "Email type — email verification", defaultValue: "Email verification" },
  { key: "super_admin.emails.type.password_reset", name: "Email type — password reset", defaultValue: "Password reset" },
  { key: "super_admin.emails.type.email_change_confirmation", name: "Email type — email change confirmation", defaultValue: "Email change" },
  // Email status labels (rendered from the `status` enum column)
  { key: "super_admin.emails.status.sent", name: "Email status — sent", defaultValue: "sent" },
  { key: "super_admin.emails.status.pending", name: "Email status — pending", defaultValue: "pending" },
  { key: "super_admin.emails.status.skipped", name: "Email status — skipped (no SMTP configured)", defaultValue: "skipped" },
  { key: "super_admin.emails.status.failed", name: "Email status — failed", defaultValue: "failed" },

  // ─── Usage page ──────────────────────────────────────────────────────────
  { key: "super_admin.usage.stat.sessions_24h", name: "Usage — Sessions (last 24h) tile", defaultValue: "Sessions (last 24h)" },
  { key: "super_admin.usage.stat.sessions_7d", name: "Usage — Sessions (last 7d) tile", defaultValue: "Sessions (last 7d)" },
  { key: "super_admin.usage.stat.active_7d", name: "Usage — Active users (last 7d) tile", defaultValue: "Active users (last 7d)" },
  { key: "super_admin.usage.col.user", name: "Usage — User column", defaultValue: "User" },
  { key: "super_admin.usage.col.started", name: "Usage — Started column", defaultValue: "Started" },
  { key: "super_admin.usage.col.last_active", name: "Usage — Last active column", defaultValue: "Last active" },
  { key: "super_admin.usage.col.duration", name: "Usage — Duration column", defaultValue: "Duration" },
  { key: "super_admin.usage.col.device", name: "Usage — Device column", defaultValue: "Device" },
  { key: "super_admin.usage.col.screen", name: "Usage — Screen column", defaultValue: "Screen" },
  { key: "super_admin.usage.col.locale", name: "Usage — Locale column", defaultValue: "Locale" },
  { key: "super_admin.usage.viewport_prefix", name: "Usage — 'vp' prefix on viewport size", defaultValue: "vp" },
  { key: "super_admin.usage.empty", name: "Usage — empty state", defaultValue: "No usage recorded yet." },

  // ─── Errors / logs page ──────────────────────────────────────────────────
  { key: "super_admin.errors.title", name: "Errors — page title", defaultValue: "Logs" },
  {
    key: "super_admin.errors.showing",
    name: "Errors — 'Showing N most recent' header",
    description: "{n} is replaced with the row count.",
    defaultValue: "Showing {n} most recent",
  },
  { key: "super_admin.errors.filter.all", name: "Errors filter — All", defaultValue: "All" },
  { key: "super_admin.errors.filter.errors", name: "Errors filter — Errors only", defaultValue: "Errors" },
  { key: "super_admin.errors.filter.warnings", name: "Errors filter — Warnings only", defaultValue: "Warnings" },
  { key: "super_admin.errors.filter.info", name: "Errors filter — Info only", defaultValue: "Info" },
  { key: "super_admin.errors.filter.server", name: "Errors filter — Server source only", defaultValue: "Server" },
  { key: "super_admin.errors.filter.client", name: "Errors filter — Client source only", defaultValue: "Client" },
  { key: "super_admin.errors.col.last_seen", name: "Errors — Last seen column", defaultValue: "Last seen" },
  { key: "super_admin.errors.col.level", name: "Errors — Level column", defaultValue: "Level" },
  { key: "super_admin.errors.col.source", name: "Errors — Source column", defaultValue: "Source" },
  { key: "super_admin.errors.col.message", name: "Errors — Message column", defaultValue: "Message" },
  { key: "super_admin.errors.col.count", name: "Errors — Count column", defaultValue: "Count" },
  { key: "super_admin.errors.col.user", name: "Errors — User column", defaultValue: "User" },
  { key: "super_admin.errors.empty", name: "Errors — empty state", defaultValue: "No log entries." },
  {
    key: "super_admin.errors.delete_confirm",
    name: "Errors — delete confirmation",
    description: "{count} is replaced with the occurrence count.",
    defaultValue: "Delete this log entry? ({count}× occurrences)",
  },
  { key: "super_admin.errors.delete_failed", name: "Errors — delete-failed error", defaultValue: "Delete failed" },
  { key: "super_admin.errors.dialog.occurrences", name: "Errors dialog — '{count}× occurrences' chip", defaultValue: "{count}× occurrences" },
  { key: "super_admin.errors.dialog.first_seen", name: "Errors dialog — First seen label", defaultValue: "First seen" },
  { key: "super_admin.errors.dialog.last_seen", name: "Errors dialog — Last seen label", defaultValue: "Last seen" },
  { key: "super_admin.errors.dialog.request", name: "Errors dialog — Request label", defaultValue: "Request" },
  { key: "super_admin.errors.dialog.url", name: "Errors dialog — URL label", defaultValue: "URL" },
  { key: "super_admin.errors.dialog.user_agent", name: "Errors dialog — User agent label", defaultValue: "User agent" },
  { key: "super_admin.errors.dialog.user", name: "Errors dialog — User label", defaultValue: "User" },
  { key: "super_admin.errors.dialog.device", name: "Errors dialog — Device label", defaultValue: "Device" },
  { key: "super_admin.errors.dialog.timezone", name: "Errors dialog — Timezone label", defaultValue: "Timezone" },
  { key: "super_admin.errors.dialog.language", name: "Errors dialog — Language label", defaultValue: "Language" },
  { key: "super_admin.errors.dialog.fingerprint", name: "Errors dialog — Fingerprint label", defaultValue: "Fingerprint" },
  { key: "super_admin.errors.dialog.stack_trace", name: "Errors dialog — Stack trace section", defaultValue: "Stack trace" },
  { key: "super_admin.errors.dialog.context", name: "Errors dialog — Context section", defaultValue: "Context" },
  // Level + source badges
  { key: "super_admin.errors.level.error", name: "Errors badge — error", defaultValue: "error" },
  { key: "super_admin.errors.level.warning", name: "Errors badge — warning", defaultValue: "warning" },
  { key: "super_admin.errors.level.info", name: "Errors badge — info", defaultValue: "info" },
  { key: "super_admin.errors.source.server", name: "Errors badge — server", defaultValue: "server" },
  { key: "super_admin.errors.source.client", name: "Errors badge — client", defaultValue: "client" },

  // ─── System settings page ────────────────────────────────────────────────
  { key: "super_admin.system_settings.title", name: "System settings — page title", defaultValue: "System settings" },
  { key: "super_admin.system_settings.description", name: "System settings — page description", defaultValue: "Runtime configuration. Changes here override the matching .env values." },
  // SMTP
  { key: "super_admin.smtp.title", name: "SMTP — section title", defaultValue: "Email (SMTP)" },
  { key: "super_admin.smtp.description", name: "SMTP — section description", defaultValue: "Outgoing email server credentials. Without these, transactional emails are written to the audit log as 'skipped' (and printed to the server console)." },
  { key: "super_admin.smtp.field.host", name: "SMTP — Host field", defaultValue: "Host" },
  { key: "super_admin.smtp.field.port", name: "SMTP — Port field", defaultValue: "Port" },
  { key: "super_admin.smtp.field.user", name: "SMTP — User field", defaultValue: "Username" },
  { key: "super_admin.smtp.field.pass", name: "SMTP — Password field", defaultValue: "Password" },
  { key: "super_admin.smtp.field.from", name: "SMTP — From-address field", defaultValue: "From address" },
  { key: "super_admin.smtp.pass.set_placeholder", name: "SMTP — Password placeholder when configured", defaultValue: "Configured — leave blank to keep" },
  { key: "super_admin.smtp.pass.unset_placeholder", name: "SMTP — Password placeholder when not configured", defaultValue: "Not set" },
  { key: "super_admin.smtp.save", name: "SMTP — Save button", defaultValue: "Save SMTP settings" },
  { key: "super_admin.smtp.test", name: "SMTP — 'Send test email' button", defaultValue: "Send test email" },
  { key: "super_admin.smtp.testing", name: "SMTP — Send-test button while sending", defaultValue: "Sending…" },
  { key: "super_admin.smtp.test_field", name: "SMTP — 'Send test to' input label", defaultValue: "Send test to" },
  { key: "super_admin.smtp.test_ok", name: "SMTP — test success toast", defaultValue: "Test email sent." },
  { key: "super_admin.smtp.test_failed", name: "SMTP — test failure fallback", defaultValue: "Could not send test email" },
  { key: "super_admin.smtp.clear_pass", name: "SMTP — Clear-password button", defaultValue: "Clear password" },
  { key: "super_admin.smtp.clear_pass_confirm", name: "SMTP — Clear-password confirm prompt", defaultValue: "Clear the stored SMTP password? Outgoing email will fail until you re-enter one." },
  // Log retention
  { key: "super_admin.log_retention.title", name: "Log retention — section title", defaultValue: "Log retention" },
  { key: "super_admin.log_retention.description", name: "Log retention — section description", defaultValue: "Whole days. 0 means \"never prune this level\". The auto-prune runs at most once per 24h, triggered opportunistically when a log entry is written." },
  { key: "super_admin.log_retention.field.error_days", name: "Log retention — Errors-days field", defaultValue: "Errors (days)" },
  { key: "super_admin.log_retention.field.warning_days", name: "Log retention — Warnings-days field", defaultValue: "Warnings (days)" },
  { key: "super_admin.log_retention.field.info_days", name: "Log retention — Info-days field", defaultValue: "Info (days)" },
  { key: "super_admin.log_retention.save", name: "Log retention — Save button", defaultValue: "Save retention" },
  { key: "super_admin.log_retention.prune", name: "Log retention — Prune-now button", defaultValue: "Prune now" },
  { key: "super_admin.log_retention.pruning", name: "Log retention — Prune-now button while running", defaultValue: "Pruning…" },
  { key: "super_admin.log_retention.save_failed", name: "Log retention — Save failure fallback", defaultValue: "Save failed" },
  { key: "super_admin.log_retention.prune_failed", name: "Log retention — Prune failure fallback", defaultValue: "Prune failed" },
  { key: "super_admin.log_retention.saved", name: "Log retention — Save success toast", defaultValue: "Saved." },
  {
    key: "super_admin.log_retention.prune_result",
    name: "Log retention — prune result toast",
    description: "{total}, {error}, {warning}, {info} substituted with counts. {plural} expands to '' or 's'.",
    defaultValue: "Pruned {total} row{plural} (errors: {error}, warnings: {warning}, info: {info}).",
  },

  // ─── Surveys list page ───────────────────────────────────────────────────
  { key: "super_admin.surveys.title", name: "Surveys — page title", defaultValue: "Surveys" },
  { key: "super_admin.surveys.description", name: "Surveys — page description", defaultValue: "Forms you publish at /s/{slug} for anonymous responses. Each survey has its own URL." },
  { key: "super_admin.surveys.new", name: "Surveys — New button", defaultValue: "New survey" },
  { key: "super_admin.surveys.empty", name: "Surveys — empty state", defaultValue: "No surveys yet — click 'New survey' to create one." },
  { key: "super_admin.surveys.col.name", name: "Surveys — Name column", defaultValue: "Name" },
  { key: "super_admin.surveys.col.public_slug", name: "Surveys — Public slug column", defaultValue: "Public link" },
  { key: "super_admin.surveys.col.status", name: "Surveys — Status column", defaultValue: "Status" },
  { key: "super_admin.surveys.col.steps", name: "Surveys — Steps column", defaultValue: "Steps" },
  { key: "super_admin.surveys.col.responses", name: "Surveys — Responses column", defaultValue: "Responses" },
  { key: "super_admin.surveys.col.updated", name: "Surveys — Updated column", defaultValue: "Updated" },
  { key: "super_admin.surveys.status.live", name: "Surveys — Live badge", defaultValue: "Live" },
  { key: "super_admin.surveys.status.draft", name: "Surveys — Draft badge", defaultValue: "Draft" },
  { key: "super_admin.surveys.dialog.create_title", name: "Surveys — New-survey dialog title", defaultValue: "New survey" },
  { key: "super_admin.surveys.dialog.name", name: "Surveys dialog — Name field", defaultValue: "Name" },
  { key: "super_admin.surveys.dialog.description", name: "Surveys dialog — Description field (optional)", defaultValue: "Description (optional)" },
  { key: "super_admin.surveys.dialog.create", name: "Surveys dialog — Create submit", defaultValue: "Create survey" },
  { key: "super_admin.surveys.create_failed", name: "Surveys — Create failed fallback", defaultValue: "Could not create survey" },

  // ─── Survey editor ───────────────────────────────────────────────────────
  { key: "super_admin.survey_editor.section_details", name: "Survey editor — 'Survey details' section title", defaultValue: "Survey details" },
  { key: "super_admin.survey_editor.field.name", name: "Survey editor — Name field", defaultValue: "Name" },
  { key: "super_admin.survey_editor.field.description", name: "Survey editor — Description field", defaultValue: "Description" },
  { key: "super_admin.survey_editor.save_survey", name: "Survey editor — Save-survey button", defaultValue: "Save survey" },
  { key: "super_admin.survey_editor.save_failed", name: "Survey editor — Save failed fallback", defaultValue: "Could not save" },
  { key: "super_admin.survey_editor.saved", name: "Survey editor — Save success message", defaultValue: "Saved" },
  { key: "super_admin.survey_editor.preview_survey", name: "Survey editor — 'Preview survey ↗' link", defaultValue: "Preview survey ↗" },
  { key: "super_admin.survey_editor.public_link", name: "Survey editor — 'Public link ↗' link", defaultValue: "Public link ↗" },
  { key: "super_admin.survey_editor.delete", name: "Survey editor — Delete-survey button", defaultValue: "Delete survey" },
  {
    key: "super_admin.survey_editor.delete_confirm",
    name: "Survey editor — Delete confirmation",
    description: "{name} substitutes the survey name.",
    defaultValue: "Delete \"{name}\" and all its steps?",
  },
  { key: "super_admin.survey_editor.delete_failed", name: "Survey editor — delete failed fallback", defaultValue: "Could not delete survey" },
  { key: "super_admin.survey_editor.publish_failed", name: "Survey editor — publish failed fallback", defaultValue: "Could not update publish state" },
  { key: "super_admin.survey_editor.publish", name: "Survey editor — Publish button", defaultValue: "Publish" },
  { key: "super_admin.survey_editor.unpublish", name: "Survey editor — Unpublish button", defaultValue: "Unpublish" },
  { key: "super_admin.survey_editor.publish_since", name: "Survey editor — 'since {date}' published-since suffix", defaultValue: "since {date}" },
  { key: "super_admin.survey_editor.steps_section", name: "Survey editor — Steps section title", defaultValue: "Steps" },
  { key: "super_admin.survey_editor.steps_description", name: "Survey editor — Steps section description", defaultValue: "Drag the handle to reorder, or use the up/down arrows. Click a tile to change a step's type." },
  { key: "super_admin.survey_editor.steps_empty", name: "Survey editor — Steps empty state", defaultValue: "No steps yet — pick a type below to add the first one." },
  { key: "super_admin.survey_editor.step.drag", name: "Survey editor — step drag handle aria-label", defaultValue: "Drag to reorder" },
  { key: "super_admin.survey_editor.step.move_up", name: "Survey editor — move-up aria-label", defaultValue: "Move up" },
  { key: "super_admin.survey_editor.step.move_down", name: "Survey editor — move-down aria-label", defaultValue: "Move down" },
  { key: "super_admin.survey_editor.step.options_prefix", name: "Survey editor — 'Options:' label prefix", defaultValue: "Options:" },
  { key: "super_admin.survey_editor.step.edit", name: "Survey editor — step Edit button", defaultValue: "Edit" },
  { key: "super_admin.survey_editor.step.delete", name: "Survey editor — step Delete button", defaultValue: "Delete" },
  { key: "super_admin.survey_editor.step.delete_confirm", name: "Survey editor — step delete confirmation", defaultValue: "Delete step \"{title}\"?" },
  { key: "super_admin.survey_editor.step.delete_failed", name: "Survey editor — step delete-failed fallback", defaultValue: "Could not delete step" },
  { key: "super_admin.survey_editor.step.reorder_failed", name: "Survey editor — step reorder failed fallback", defaultValue: "Could not reorder steps" },
  { key: "super_admin.survey_editor.add_step", name: "Survey editor — Add-step heading", defaultValue: "Add step" },
  { key: "super_admin.survey_editor.add_step.title", name: "Survey editor — Title field", defaultValue: "Title" },
  { key: "super_admin.survey_editor.add_step.notes", name: "Survey editor — Notes field", defaultValue: "Notes (optional)" },
  { key: "super_admin.survey_editor.add_step.options", name: "Survey editor — Options field", defaultValue: "Options (one per line)" },
  { key: "super_admin.survey_editor.add_step.submit", name: "Survey editor — Add-step submit", defaultValue: "Add step" },
  { key: "super_admin.survey_editor.add_step.submitting", name: "Survey editor — Add-step submitting label", defaultValue: "Adding…" },
  { key: "super_admin.survey_editor.add_step.failed", name: "Survey editor — Add-step failed fallback", defaultValue: "Could not add step" },
  { key: "super_admin.survey_editor.edit_step.save", name: "Survey editor — step edit Save", defaultValue: "Save step" },
  { key: "super_admin.survey_editor.edit_step.saving", name: "Survey editor — step edit Saving", defaultValue: "Saving…" },
  { key: "super_admin.survey_editor.edit_step.failed", name: "Survey editor — step edit failed fallback", defaultValue: "Could not save step" },
  { key: "super_admin.survey_editor.type_picker", name: "Survey editor — type picker label above the grid", defaultValue: "Pick a type" },

  // ─── Public survey form (/s/[slug]) ──────────────────────────────────────
  { key: "public_survey.submit", name: "Public survey — Submit button", defaultValue: "Submit" },
  { key: "public_survey.submitting", name: "Public survey — Submit button while submitting", defaultValue: "Submitting…" },
  { key: "public_survey.thanks_title", name: "Public survey — Thank-you title after submit", defaultValue: "Thanks for your response!" },
  { key: "public_survey.thanks_body", name: "Public survey — Thank-you body after submit", defaultValue: "Your answers have been recorded." },
  { key: "public_survey.required_aria", name: "Public survey — '(required)' aria suffix", defaultValue: "(required)" },
  { key: "public_survey.required_asterisk_aria", name: "Public survey — required asterisk aria-label", defaultValue: "required" },
  { key: "public_survey.error_generic", name: "Public survey — error fallback", defaultValue: "Could not submit. Please try again." },
  { key: "public_survey.preview_chip", name: "Public survey — admin preview banner", defaultValue: "Preview — submissions are not recorded" },
  { key: "public_survey.field.short_text_placeholder", name: "Public survey — short_text placeholder", defaultValue: "Your answer" },
  { key: "public_survey.field.long_text_placeholder", name: "Public survey — long_text placeholder", defaultValue: "Your answer" },
  { key: "public_survey.field.yes", name: "Public survey — Yes option", defaultValue: "Yes" },
  { key: "public_survey.field.no", name: "Public survey — No option", defaultValue: "No" },

  // ─── Tags catalog (/super-admin/tags) ────────────────────────────────────
  { key: "super_admin.tags.title", name: "Tags — page title", defaultValue: "Tags" },
  {
    key: "super_admin.tags.description",
    name: "Tags — page description",
    defaultValue: "Manage tag categories and tags used to label surveys.",
  },
  { key: "super_admin.tags.new_tag", name: "Tags — '+ New tag' button", defaultValue: "New tag" },
  {
    key: "super_admin.tags.duplicate_name",
    name: "Tags — duplicate name error",
    defaultValue: "A tag with that name already exists.",
  },
  { key: "super_admin.tags.save_failed", name: "Tags — generic save failure", defaultValue: "Failed to save tag" },
  {
    key: "super_admin.tags.delete_confirm",
    name: "Tags — delete confirmation prompt",
    description: "{name} substitutes the tag name.",
    defaultValue: "Delete tag \"{name}\"? It will be removed from the catalog.",
  },
  { key: "super_admin.tags.delete_failed", name: "Tags — delete failure fallback", defaultValue: "Failed to delete tag" },
  {
    key: "super_admin.tags.delete_in_use",
    name: "Tags — 409 'tag in use' message",
    description: "{n} substitutes the survey count; {plural} is \"\" for 1 / \"s\" otherwise.",
    defaultValue: "This tag is attached to {n} survey{plural}. Remove it first.",
  },
  {
    key: "super_admin.tags.search_placeholder",
    name: "Tags — search input placeholder",
    defaultValue: "Search tags by name…",
  },
  { key: "super_admin.tags.empty", name: "Tags — empty state (with search)", defaultValue: "No tags match your search." },
  {
    key: "super_admin.tags.no_categories",
    name: "Tags — empty state when no categories exist",
    defaultValue: "No categories yet — create one in the sidebar.",
  },
  {
    key: "super_admin.tags.chip_title",
    name: "Tags — category chip title (tooltip)",
    description: "{name} substitutes the category name.",
    defaultValue: "Filter by category {name}",
  },
  { key: "super_admin.tags.col.name", name: "Tags — Name column header", defaultValue: "Name" },
  { key: "super_admin.tags.col.categories", name: "Tags — Categories column header", defaultValue: "Categories" },
  { key: "super_admin.tags.col.usage", name: "Tags — Usage column header", defaultValue: "Usage" },
  { key: "super_admin.tags.col.actions", name: "Tags — Actions column header", defaultValue: "Actions" },
  {
    key: "super_admin.tags.pagination.showing",
    name: "Tags — pagination 'Showing X–Y of N'",
    description: "{from}, {to}, {total} substitute row range and total.",
    defaultValue: "Showing {from}–{to} of {total}",
  },
  { key: "super_admin.tags.pagination.prev", name: "Tags — pagination Previous", defaultValue: "Previous" },
  { key: "super_admin.tags.pagination.next", name: "Tags — pagination Next", defaultValue: "Next" },
  {
    key: "super_admin.tags.pagination.page_of",
    name: "Tags — pagination 'Page X of Y'",
    description: "{page} and {total} substitute current and total page count.",
    defaultValue: "Page {page} of {total}",
  },
  { key: "super_admin.tags.form.create_title", name: "Tags — new-tag dialog title", defaultValue: "New tag" },
  { key: "super_admin.tags.form.edit_title", name: "Tags — edit-tag dialog title", defaultValue: "Edit tag" },
  { key: "super_admin.tags.form.name", name: "Tags — Name field label", defaultValue: "Name" },
  { key: "super_admin.tags.form.categories_label", name: "Tags — Categories field label", defaultValue: "Categories" },
  {
    key: "super_admin.tags.form.no_categories",
    name: "Tags — Categories field empty hint",
    defaultValue: "No categories available.",
  },
  { key: "super_admin.tags.form.create_submit", name: "Tags — new-tag submit", defaultValue: "Create tag" },
  { key: "super_admin.tags.form.edit_submit", name: "Tags — edit-tag submit", defaultValue: "Save changes" },
  { key: "super_admin.tags.scope.all", name: "Tags — sidebar 'All tags' entry", defaultValue: "All tags" },
  {
    key: "super_admin.tags.scope.uncategorized",
    name: "Tags — sidebar 'Uncategorized' entry",
    defaultValue: "Uncategorized",
  },
  { key: "super_admin.tags.categories.title", name: "Tags — categories sidebar heading", defaultValue: "Categories" },
  { key: "super_admin.tags.categories.new", name: "Tags — '+ New category' button", defaultValue: "New category" },
  {
    key: "super_admin.tags.categories.create_failed",
    name: "Tags — category create failed",
    defaultValue: "Failed to create category",
  },
  {
    key: "super_admin.tags.categories.update_failed",
    name: "Tags — category update failed",
    defaultValue: "Failed to update category",
  },
  {
    key: "super_admin.tags.categories.delete_failed",
    name: "Tags — category delete failed",
    defaultValue: "Failed to delete category",
  },
  {
    key: "super_admin.tags.categories.duplicate_name",
    name: "Tags — category duplicate-name error",
    defaultValue: "A category with that name already exists.",
  },
  {
    key: "super_admin.tags.categories.delete_confirm",
    name: "Tags — category delete confirmation",
    description: "{name} category name; {n} tag count; {plural} \"\" for 1 / \"s\" otherwise.",
    defaultValue: "Delete category \"{name}\"? {n} tag{plural} will become uncategorized.",
  },
  {
    key: "super_admin.tags.categories.field.name",
    name: "Tags — category Name field label",
    defaultValue: "Name",
  },
  {
    key: "super_admin.tags.categories.field.description",
    name: "Tags — category Description field label",
    defaultValue: "Description",
  },
  {
    key: "super_admin.tags.categories.create_submit",
    name: "Tags — category create submit",
    defaultValue: "Create category",
  },
  {
    key: "super_admin.tags.categories.update_submit",
    name: "Tags — category update submit",
    defaultValue: "Save changes",
  },

  // ─── Survey editor tag picker (super_admin.tags.picker.*) ────────────────
  {
    key: "super_admin.tags.picker.section_title",
    name: "Survey editor — Tags section title",
    defaultValue: "Tags",
  },
  {
    key: "super_admin.tags.picker.summary",
    name: "Survey editor — '{n} tags attached' summary",
    description: "{n} substitutes the count of currently-attached tags.",
    defaultValue: "{n} tags attached",
  },
  {
    key: "super_admin.tags.picker.uncategorized_group",
    name: "Survey editor — Uncategorized group label in picker",
    defaultValue: "Uncategorized",
  },
  { key: "super_admin.tags.picker.save", name: "Survey editor — Save tags button", defaultValue: "Save tags" },
  { key: "super_admin.tags.picker.saving", name: "Survey editor — Saving… label", defaultValue: "Saving…" },
  { key: "super_admin.tags.picker.saved", name: "Survey editor — Saved confirmation", defaultValue: "Saved" },
  {
    key: "super_admin.tags.picker.save_failed",
    name: "Survey editor — save-failed fallback",
    defaultValue: "Failed to save tags",
  },
  {
    key: "super_admin.tags.picker.unknown_tag_ids",
    name: "Survey editor — 400 unknown_tag_ids message",
    defaultValue: "One or more tags are no longer available — please reload the page.",
  },
  {
    key: "super_admin.tags.picker.empty_state",
    name: "Survey editor — picker empty state",
    defaultValue: "No tags in the catalog yet.",
  },
];

const TRANSLATIONS_BY_KEY = new Map(KNOWN_TRANSLATIONS.map((t) => [t.key, t]));

/** Look up a registry entry by key; `undefined` for unknown keys. */
export function getKnownTranslation(key: string): TranslationKeyDef | undefined {
  return TRANSLATIONS_BY_KEY.get(key);
}

/** Values accepted as interpolation params. Numbers/booleans stringify. */
export type TranslateParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Resolve a single key against a loaded dict, with the same fallback
 * chain `getTranslations` builds for full dictionaries: dict value →
 * registry default → key string.
 *
 * Optional `params` interpolate `{name}` placeholders inside the
 * resolved string. Missing placeholders are left in place so a typo
 * in either the registry or the call site is visible. Empty/undefined
 * values render as the empty string.
 */
export function translate(
  dict: TranslationDict,
  key: string,
  params?: TranslateParams,
): string {
  const fromDict = dict[key];
  const template =
    typeof fromDict === "string" && fromDict.length > 0
      ? fromDict
      : (TRANSLATIONS_BY_KEY.get(key)?.defaultValue ?? key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    if (v === undefined) return whole;
    if (v === null) return "";
    return String(v);
  });
}
