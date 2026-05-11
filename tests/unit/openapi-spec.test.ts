import { describe, expect, it } from "vitest";

import { getOpenApiDocument } from "@/lib/openapi/spec";

describe("OpenAPI spec generation", () => {
  it("produces a well-formed OpenAPI 3.0 document", () => {
    const doc = getOpenApiDocument();
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info?.title).toBe("wl-web-app API");
    expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(20);
  });

  it("exposes the documented endpoint groups under their tags", () => {
    const doc = getOpenApiDocument();
    const tagNames = (doc.tags ?? []).map((t) => t.name);
    expect(tagNames).toContain("Auth");
    expect(tagNames).toContain("Super admin · Users");
    expect(tagNames).toContain("Super admin · Surveys");
  });

  it("declares the session-cookie security scheme", () => {
    const doc = getOpenApiDocument();
    expect(doc.components?.securitySchemes?.sessionCookie).toMatchObject({
      type: "apiKey",
      in: "cookie",
    });
  });

  it("registers DTO components as schemas", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components?.schemas ?? {};
    expect(schemas).toHaveProperty("User");
    expect(schemas).toHaveProperty("SurveyDetail");
    expect(schemas).toHaveProperty("ErrorResponse");
  });
});
