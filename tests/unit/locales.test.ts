import { describe, expect, it } from "vitest";

import {
  COUNTRIES,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  flagEmoji,
  formatLocaleLabel,
  getCountry,
  getLanguage,
  isValidCountryLanguage,
} from "@/lib/locales";
import { createLanguageSchema } from "@/lib/validators";

describe("locales dataset", () => {
  it("country codes are unique ISO 3166-1 alpha-2", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("language codes are unique ISO 639-1", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z]{2,3}$/);
  });

  it("every country language references a known language", () => {
    const known = new Set(LANGUAGES.map((l) => l.code));
    for (const country of COUNTRIES) {
      for (const code of country.languages) {
        expect(known.has(code), `${country.code} → ${code} not in LANGUAGES`).toBe(true);
      }
    }
  });

  it("every country has at least one language", () => {
    for (const c of COUNTRIES) expect(c.languages.length).toBeGreaterThan(0);
  });

  it("default English is GB-en and is valid", () => {
    expect(DEFAULT_LANGUAGE.countryCode).toBe("GB");
    expect(DEFAULT_LANGUAGE.languageCode).toBe("en");
    expect(
      isValidCountryLanguage(DEFAULT_LANGUAGE.countryCode, DEFAULT_LANGUAGE.languageCode),
    ).toBe(true);
  });

  it("isValidCountryLanguage rejects unknown pairs", () => {
    expect(isValidCountryLanguage("XX", "en")).toBe(false);
    expect(isValidCountryLanguage("DK", "ja")).toBe(false);
    expect(isValidCountryLanguage("DK", "da")).toBe(true);
    expect(isValidCountryLanguage("CH", "rm")).toBe(true);
  });

  it("getCountry / getLanguage look up by code", () => {
    expect(getCountry("DK")?.name).toBe("Denmark");
    expect(getLanguage("da")?.name).toBe("Danish");
    expect(getCountry("XX")).toBeUndefined();
    expect(getLanguage("xx")).toBeUndefined();
  });

  it("formatLocaleLabel renders human strings", () => {
    expect(formatLocaleLabel("GB", "en")).toBe("English (United Kingdom)");
    expect(formatLocaleLabel("CH", "rm")).toBe("Romansh (Switzerland)");
    // Falls back to raw codes for unknowns so older DB rows stay
    // displayable.
    expect(formatLocaleLabel("XX", "yy")).toBe("yy (XX)");
  });

  it("flagEmoji maps two-letter country codes to regional indicators", () => {
    expect(flagEmoji("GB")).toBe("\u{1F1EC}\u{1F1E7}");
    expect(flagEmoji("dk")).toBe("\u{1F1E9}\u{1F1F0}");
    expect(flagEmoji("X1")).toBe("");
    expect(flagEmoji("USA")).toBe("");
  });
});

describe("createLanguageSchema", () => {
  it("accepts a valid country/language pair and canonicalises case", () => {
    const r = createLanguageSchema.parse({ countryCode: "gb", languageCode: "EN" });
    expect(r.countryCode).toBe("GB");
    expect(r.languageCode).toBe("en");
  });

  it("rejects unknown country", () => {
    expect(
      createLanguageSchema.safeParse({ countryCode: "ZZ", languageCode: "en" }).success,
    ).toBe(false);
  });

  it("rejects language not spoken in the chosen country", () => {
    expect(
      createLanguageSchema.safeParse({ countryCode: "DK", languageCode: "ja" }).success,
    ).toBe(false);
  });

  it("rejects malformed codes", () => {
    expect(
      createLanguageSchema.safeParse({ countryCode: "ZZZ", languageCode: "en" }).success,
    ).toBe(false);
    expect(
      createLanguageSchema.safeParse({ countryCode: "DK", languageCode: "1" }).success,
    ).toBe(false);
  });
});
