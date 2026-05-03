import { describe, expect, it } from "vitest";

import { normalizeWriteData } from "@/lib/db";

describe("normalizeWriteData", () => {
  it("trims string fields", () => {
    const data: Record<string, unknown> = { name: "  Alice  ", subject: "Hi\n" };
    normalizeWriteData(data);
    expect(data.name).toBe("Alice");
    expect(data.subject).toBe("Hi");
  });

  it("trims and lower-cases email-like fields", () => {
    const data: Record<string, unknown> = {
      email: "  Foo@BAR.COM ",
      newEmail: "NEW@x.com",
      oldEmail: " Old@Y.com",
    };
    normalizeWriteData(data);
    expect(data.email).toBe("foo@bar.com");
    expect(data.newEmail).toBe("new@x.com");
    expect(data.oldEmail).toBe("old@y.com");
  });

  it("never touches hash fields", () => {
    const hash = "$argon2id$v=19$m=19456,t=2,p=1$SALT==$HASH==";
    const data: Record<string, unknown> = {
      passwordHash: hash,
      tokenHash: " abc123 ",
      ipHash: " ip ",
    };
    normalizeWriteData(data);
    expect(data.passwordHash).toBe(hash);
    expect(data.tokenHash).toBe(" abc123 ");
    expect(data.ipHash).toBe(" ip ");
  });

  it("normalises the scalar-update form { field: { set: ... } }", () => {
    const data: Record<string, unknown> = {
      name: { set: "  Alice " },
      email: { set: "  X@Y.COM " },
    };
    normalizeWriteData(data);
    expect((data.name as { set: string }).set).toBe("Alice");
    expect((data.email as { set: string }).set).toBe("x@y.com");
  });

  it("handles createMany arrays", () => {
    const data = [
      { email: " A@B.COM ", name: " a " },
      { email: " C@D.COM ", name: " c " },
    ];
    normalizeWriteData(data);
    expect(data[0]).toEqual({ email: "a@b.com", name: "a" });
    expect(data[1]).toEqual({ email: "c@d.com", name: "c" });
  });

  it("leaves non-string values alone", () => {
    const data: Record<string, unknown> = { count: 42, flag: true, when: new Date(0), nope: null };
    normalizeWriteData(data);
    expect(data.count).toBe(42);
    expect(data.flag).toBe(true);
    expect(data.when).toEqual(new Date(0));
    expect(data.nope).toBeNull();
  });

  it("is a no-op on undefined / null payloads", () => {
    expect(() => normalizeWriteData(undefined)).not.toThrow();
    expect(() => normalizeWriteData(null)).not.toThrow();
  });
});
