// ---------------------------------------------------------------------------
// User validation tests
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import { newUserRules, updateUserRules } from "./user.validation.ts";

describe.each([
  { label: "newUserRules", rules: newUserRules },
  { label: "updateUserRules", rules: updateUserRules },
])("$label", ({ rules }) => {
  it("accepts a body with a username", () => {
    const result = rules.safeParse({ username: "ada" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ username: "ada" });
  });

  it("rejects an empty body", () => {
    const result = rules.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a missing body", () => {
    expect(rules.safeParse(undefined).success).toBe(false);
    expect(rules.safeParse(null).success).toBe(false);
  });

  it("rejects a username that is not text", () => {
    expect(rules.safeParse({ username: 7 }).success).toBe(false);
    expect(rules.safeParse({ username: ["ada"] }).success).toBe(false);
  });

  it("trims the username", () => {
    const result = rules.safeParse({ username: "  ada  " });

    expect(result.success).toBe(true);
    expect(result.data?.username).toBe("ada");
  });

  it("rejects a username that is only whitespace", () => {
    expect(rules.safeParse({ username: "   " }).success).toBe(false);
  });

  it("rejects an empty username", () => {
    expect(rules.safeParse({ username: "" }).success).toBe(false);
  });

  it("accepts a username of exactly 50 characters", () => {
    expect(rules.safeParse({ username: "a".repeat(50) }).success).toBe(true);
  });

  it("rejects a username longer than 50 characters", () => {
    expect(rules.safeParse({ username: "a".repeat(51) }).success).toBe(false);
  });

  it("measures the length after trimming", () => {
    const result = rules.safeParse({ username: `  ${"a".repeat(50)}  ` });

    expect(result.success).toBe(true);
  });

  it("rejects a body carrying an id", () => {
    const result = rules.safeParse({
      username: "ada",
      id: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(false);
  });

  it("rejects any field that is not in the schema", () => {
    expect(
      rules.safeParse({ username: "ada", banana: 7 }).success,
    ).toBe(false);
  });
});
