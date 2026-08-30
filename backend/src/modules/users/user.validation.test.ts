// ---------------------------------------------------------------------------
// User validation tests
//
// No database and no HTTP here. These call the rule sets directly, which is
// what makes them fast enough to run on every save. The route tests cover the
// same rules end to end, but only for the handful of cases worth paying a
// network round trip for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import { newUserRules, updateUserRules } from "./user.validation.ts";

// ---------------------------------------------------------------------------
// Both rule sets are the same shape today, and both guard the same field, so
// each case is written once and run twice. describe.each takes a list and
// repeats the whole block for every entry, with $label naming each run in the
// output. Writing the two blocks out by hand would work too, but then a rule
// added to one and forgotten in the other would still look tested.
//
// If update later diverges, for example by allowing a partial body, give it a
// describe block of its own and leave this one to newUserRules.
// ---------------------------------------------------------------------------

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

  // Trimming happens before the length check, so a username of only spaces is
  // caught here rather than becoming a blank name shown next to someone's data.
  it("rejects a username that is only whitespace", () => {
    expect(rules.safeParse({ username: "   " }).success).toBe(false);
  });

  it("rejects an empty username", () => {
    expect(rules.safeParse({ username: "" }).success).toBe(false);
  });

  // The two sides of the max(50) boundary. Testing only the rejection would
  // still pass if the limit were accidentally lowered to 10.
  it("accepts a username of exactly 50 characters", () => {
    expect(rules.safeParse({ username: "a".repeat(50) }).success).toBe(true);
  });

  it("rejects a username longer than 50 characters", () => {
    expect(rules.safeParse({ username: "a".repeat(51) }).success).toBe(false);
  });

  // Same ordering point as above, from the other end: 50 real characters
  // wrapped in spaces is 54 characters of input but a legal username.
  it("measures the length after trimming", () => {
    const result = rules.safeParse({ username: `  ${"a".repeat(50)}  ` });

    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // strict()
  //
  // This is the security behaviour of the module. The contact rules strip
  // unknown keys quietly; these reject the whole request instead, so a client
  // that tries to choose its own user id is told no rather than having the
  // field silently ignored. The id always comes from the verified token.
  // ---------------------------------------------------------------------------

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
