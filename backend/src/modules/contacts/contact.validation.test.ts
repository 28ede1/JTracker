// ---------------------------------------------------------------------------
// Contact validation tests
//
// No database and no HTTP here. These call the rule sets directly, which is
// what makes them fast enough to run on every save. The route tests cover the
// same rules end to end, but only for the handful of cases worth paying a
// network round trip for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  newContactRules,
  contactQueryRules,
  contactIdRules,
} from "./contact.validation.ts";

describe("newContactRules", () => {
  it("rejects an empty body", () => {
    const result = newContactRules.safeParse({});

    expect(result.success).toBe(false);
  });

  it("accepts a body with every field and coerces dates", () => {
    const result = newContactRules.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      title: "Engineering Manager",
      email: "ada@example.com",
      phone: "+1 555 0100",
      linkedinUrl: "https://linkedin.com/in/example",
      relationship: "HIRING_MANAGER",
      notes: "Met at a career fair.",
      lastContactedAt: "2026-03-01T12:00:00.000Z",
      nextFollowUpAt: "2026-04-01T12:00:00.000Z",
      companyId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      title: "Engineering Manager",
      email: "ada@example.com",
      phone: "+1 555 0100",
      linkedinUrl: "https://linkedin.com/in/example",
      relationship: "HIRING_MANAGER",
      notes: "Met at a career fair.",

      // Text in, Date out. Prisma will not accept the string, so this coercion
      // is the reason a contact can be created from a plain JSON body.
      lastContactedAt: new Date("2026-03-01T12:00:00.000Z"),
      nextFollowUpAt: new Date("2026-04-01T12:00:00.000Z"),
      companyId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  // Only two fields are required, which matters because a contact is often
  // saved the moment a name is heard, before anything else is known.
  it("accepts a body with only the required fields", () => {
    const result = newContactRules.safeParse({
      firstName: "Ada",
      relationship: "RECRUITER",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a body with no first name", () => {
    const result = newContactRules.safeParse({ relationship: "RECRUITER" });

    expect(result.success).toBe(false);
  });

  it("rejects a body with no relationship", () => {
    const result = newContactRules.safeParse({ firstName: "Ada" });

    expect(result.success).toBe(false);
  });

  it("rejects a relationship that is not part of the allowed enums", () => {
    const result = newContactRules.safeParse({
      firstName: "Ada",
      relationship: "FRIEND",
    });

    expect(result.success).toBe(false);
  });

  it("trims the first name", () => {
    const result = newContactRules.safeParse({
      firstName: "  Ada  ",
      relationship: "RECRUITER",
    });

    expect(result.success).toBe(true);
    expect(result.data?.firstName).toBe("Ada");
  });

  // Trimming happens before the length check, so a name of only spaces is
  // caught here rather than becoming a blank row in the contact list.
  it("rejects a first name that is only whitespace", () => {
    const result = newContactRules.safeParse({
      firstName: "   ",
      relationship: "RECRUITER",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a first name that is too long", () => {
    const result = newContactRules.safeParse({
      firstName: "a".repeat(51),
      relationship: "RECRUITER",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an email that is not an email", () => {
    const result = newContactRules.safeParse({
      firstName: "Ada",
      relationship: "RECRUITER",
      email: "ada-at-example",
    });

    expect(result.success).toBe(false);
  });

  // linkedinUrl is rendered as a clickable link, so a value that is not a real
  // url has to be stopped at the edge rather than stored and shown to a user.
  it("rejects a linkedin url that is not a url", () => {
    const result = newContactRules.safeParse({
      firstName: "Ada",
      relationship: "RECRUITER",
      linkedinUrl: "linkedin.com/in/example",
    });

    expect(result.success).toBe(false);
  });

  it("rejects notes that are too long", () => {
    const result = newContactRules.safeParse({
      firstName: "Ada",
      relationship: "RECRUITER",
      notes: "a".repeat(5001),
    });

    expect(result.success).toBe(false);
  });

  it("rejects a company id not in the right format", () => {
    const result = newContactRules.safeParse({
      firstName: "Ada",
      relationship: "RECRUITER",
      companyId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });

  // This is the security behaviour, and it is what stops a client from choosing
  // who a contact belongs to. userId is not in the schema, so it is dropped
  // here and the route supplies the id from the verified token instead.
  it("strips fields that are not in the schema", () => {
    const result = newContactRules.safeParse({
      firstName: "Ada",
      relationship: "RECRUITER",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      banana: 7,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      firstName: "Ada",
      relationship: "RECRUITER",
    });
  });
});

// Express hands over every query parameter as text, so each test feeds strings
// in and checks the parsed value that comes out.
describe("contactQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = contactQueryRules.safeParse({});

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });

  it("accepts every parameter and coerces the numbers", () => {
    const result = contactQueryRules.safeParse({
      page: "2",
      limit: "10",
      q: "ada",
      relationship: "ALUMNI",
      companyId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 2,
      limit: 10,
      q: "ada",
      relationship: "ALUMNI",
      companyId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects a page below 1", () => {
    expect(contactQueryRules.safeParse({ page: "0" }).success).toBe(false);
    expect(contactQueryRules.safeParse({ page: "-5" }).success).toBe(false);
  });

  it("rejects a limit above the maximum", () => {
    expect(contactQueryRules.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects a page that is not a whole number", () => {
    expect(contactQueryRules.safeParse({ page: "abc" }).success).toBe(false);
    expect(contactQueryRules.safeParse({ page: "1.5" }).success).toBe(false);
  });

  it("trims the search term", () => {
    const result = contactQueryRules.safeParse({ q: "  ada  " });

    expect(result.success).toBe(true);
    expect(result.data?.q).toBe("ada");
  });

  // A cleared search box sends q as an empty string. That must drop the filter
  // rather than fail the request.
  it("treats an empty search term as no search", () => {
    const result = contactQueryRules.safeParse({ q: "" });

    expect(result.success).toBe(true);
    expect(result.data?.q).toBeUndefined();
  });

  it("rejects a search term that is too long", () => {
    expect(contactQueryRules.safeParse({ q: "a".repeat(101) }).success).toBe(
      false,
    );
  });

  it("rejects a relationship that is not part of the allowed enums", () => {
    expect(contactQueryRules.safeParse({ relationship: "FRIEND" }).success).toBe(
      false,
    );
  });

  it("rejects a company id not in the right format", () => {
    expect(contactQueryRules.safeParse({ companyId: "not-a-guid" }).success).toBe(
      false,
    );
  });

  // A parameter that is not declared must never reach the service and become a
  // filter. userId is the one that matters: a client must not be able to ask
  // for someone else's contacts by adding it to the query string.
  it("strips parameters that are not in the schema", () => {
    const result = contactQueryRules.safeParse({
      page: "1",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      banana: "7",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });
});

describe("contactIdRules", () => {
  it("rejects a non-uuid string", () => {
    expect(contactIdRules.safeParse("not-a-uuid").success).toBe(false);
  });

  it("accepts a uuid", () => {
    expect(
      contactIdRules.safeParse("3f1c1b2e-9a4d-4f0e-8b3a-2c5d6e7f8a90").success,
    ).toBe(true);
  });
});
