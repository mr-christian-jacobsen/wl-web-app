import { SwaggerUIClient } from "./swagger-ui-client";

// The /super-admin layout already validates the session and redirects
// non-admins, so the spec URL and this page are both shielded. The spec
// endpoint additionally re-checks via `requireSuperAdmin` as a backstop.
export default function ApiDocsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">API documentation</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Generated from the route registrations in{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
            src/lib/openapi
          </code>
          . &ldquo;Try it out&rdquo; uses your existing session cookie — admin endpoints
          will work directly, public endpoints work for anyone.
        </p>
      </div>
      <div className="-mx-2 rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <SwaggerUIClient specUrl="/api/openapi" />
      </div>
    </div>
  );
}
