import { describe, expect, it } from "vitest";

import { escapeHtml, renderTemplate } from "@/lib/templates";

describe("renderTemplate", () => {
  it("substitutes named variables", () => {
    expect(renderTemplate("Hello {{name}}!", { name: "Alice" })).toBe("Hello Alice!");
  });

  it("substitutes multiple occurrences of the same variable", () => {
    expect(renderTemplate("{{x}} and {{x}}", { x: "y" })).toBe("y and y");
  });

  it("tolerates whitespace inside braces", () => {
    expect(renderTemplate("Hi {{  name  }}", { name: "Bob" })).toBe("Hi Bob");
  });

  it("leaves unknown placeholders intact", () => {
    expect(renderTemplate("{{a}} {{b}}", { a: "1" })).toBe("1 {{b}}");
  });

  it("leaves explicit null/undefined placeholders intact", () => {
    expect(renderTemplate("{{a}} {{b}}", { a: null, b: undefined })).toBe("{{a}} {{b}}");
  });

  it("ignores non-placeholder braces", () => {
    expect(renderTemplate("plain { not } a placeholder", { a: "x" })).toBe(
      "plain { not } a placeholder",
    );
  });

  it("coerces numbers to strings", () => {
    expect(renderTemplate("count={{n}}", { n: 42 })).toBe("count=42");
  });

  it("escapes substituted values when an escaper is provided", () => {
    expect(
      renderTemplate("Hi {{name}}", { name: '<img src=x onerror="boom">' }, escapeHtml),
    ).toBe("Hi &lt;img src=x onerror=&quot;boom&quot;&gt;");
  });
});

describe("escapeHtml", () => {
  it("escapes the five common HTML metacharacters", () => {
    expect(escapeHtml(`<a href="x" data-x='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; data-x=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("leaves safe text alone", () => {
    expect(escapeHtml("Hello, world.")).toBe("Hello, world.");
  });
});
