"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";

import "@scalar/api-reference-react/style.css";

// Scalar replaces swagger-ui-react: same OpenAPI 3.0 input, modern UI, no
// deprecated React lifecycle warnings under strict mode. Try-it-out runs
// same-origin against /api/openapi (and the routes it describes), so the
// browser's existing session cookie is sent automatically.
export function ScalarClient({ specUrl }: { specUrl: string }) {
  return (
    <ApiReferenceReact
      configuration={{
        url: specUrl,
        // Match the existing dark/light support — Scalar's `theme: "default"`
        // tracks the document's color-scheme attribute, which the rest of
        // the admin UI already drives via Tailwind.
        theme: "default",
        hideClientButton: true,
      }}
    />
  );
}
