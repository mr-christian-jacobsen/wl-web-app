import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";

import { registry } from "./registry";
import "./register-validators";
import "./schemas";
import { registerAdminLanguageRoutes } from "./routes/admin-languages";
import { registerAdminSettingsRoutes } from "./routes/admin-settings";
import { registerAdminSurveyRoutes } from "./routes/admin-surveys";
import { registerAdminTaskRoutes } from "./routes/admin-tasks";
import { registerAdminTemplateRoutes } from "./routes/admin-templates";
import { registerAdminUserRoutes } from "./routes/admin-users";
import { registerAuthRoutes } from "./routes/auth";
import { registerMiscPublicRoutes } from "./routes/misc-public";
import { registerProfileRoutes } from "./routes/profile";

// Idempotent — `registerPath` does throw on duplicate path+method pairs, so
// we guard against the second invocation. The dev server hot-reloads the
// module on every request, which would otherwise blow up after the first
// reload.
let registered = false;

function registerAll() {
  if (registered) return;
  registerAuthRoutes();
  registerProfileRoutes();
  registerMiscPublicRoutes();
  registerAdminUserRoutes();
  registerAdminTemplateRoutes();
  registerAdminSurveyRoutes();
  registerAdminLanguageRoutes();
  registerAdminSettingsRoutes();
  registerAdminTaskRoutes();
  registered = true;
}

export function generateOpenApiDocument() {
  registerAll();
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "wl-web-app API",
      version: "1.0.0",
      description:
        "Next.js App Router API for wl-web-app. Public endpoints (auth, survey submission, client log forwarding) need no credentials; everything else uses the same Auth.js session cookie the browser already holds, so 'Try it out' works directly when this page is open in an authenticated session.",
    },
    servers: [{ url: "/", description: "Same-origin (uses the browser session cookie)" }],
    tags: [
      { name: "Auth", description: "Signup, password reset, email verification, signout." },
      { name: "Profile", description: "The signed-in user's own account." },
      { name: "Public surveys", description: "Unauthenticated survey submission." },
      { name: "Usage", description: "Client-side usage heartbeats." },
      { name: "Logging", description: "Forward client-side log entries." },
      { name: "Avatar", description: "Avatar upload, fetch and removal." },
      { name: "Super admin · Users", description: "Manage user accounts (super-admin only)." },
      { name: "Super admin · Surveys", description: "Survey CRUD + steps + publishing." },
      { name: "Super admin · Languages", description: "Locale catalog." },
      { name: "Super admin · Translations", description: "UI string translations." },
      { name: "Super admin · Email templates", description: "Per-language email template copy." },
      { name: "Super admin · Email log", description: "Inspect / resend prior emails." },
      { name: "Super admin · Error log", description: "Captured error/warning/info events." },
      { name: "Super admin · System settings", description: "SMTP, translate provider, retention." },
      { name: "Super admin · Tasks", description: "Task definitions and instance lifecycle." },
    ],
  });
}

/** Lazy memoized accessor — the spec is fully static so we cache once. */
let cached: ReturnType<typeof generateOpenApiDocument> | null = null;
export function getOpenApiDocument() {
  if (cached === null) cached = generateOpenApiDocument();
  return cached;
}
