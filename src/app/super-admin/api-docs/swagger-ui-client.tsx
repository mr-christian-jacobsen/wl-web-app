"use client";

import dynamic from "next/dynamic";

// swagger-ui-react reaches into `window` at import time, so we have to keep
// it strictly client-side. `dynamic({ ssr: false })` defers the import and
// renders nothing on the server.
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

import "swagger-ui-react/swagger-ui.css";

export function SwaggerUIClient({ specUrl }: { specUrl: string }) {
  return (
    <SwaggerUI
      url={specUrl}
      docExpansion="list"
      defaultModelsExpandDepth={0}
      // The browser already holds the Auth.js session cookie; tell SwaggerUI
      // to include it on every Try-it-out request. Without this the fetch
      // strips cookies because the spec is served from the same origin but
      // SwaggerUI defaults to `omit`.
      requestInterceptor={(req: { credentials?: string }) => {
        req.credentials = "include";
        return req;
      }}
    />
  );
}
