// ---------------------------------------------------------------------------
// Application validation tests
//
// No database and no HTTP here. These call the rule sets directly, which is
// what makes them fast enough to run on every save. The route tests cover the
// same rules end to end, but only for the handful of cases worth paying a
// network round trip for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  newApplicationRules,
  applicationQueryRules,
  updateApplicationRules,
  applicationIdRules,
} from "./application.validation.ts";

// A valid uuid reused across the tests, so a failure is never about the shape
// of the id when the test is about something else.
const ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_ID = "3f1c1b2e-9a4d-4f0e-8b3a-2c5d6e7f8a90";

describe("newApplicationRules", () => {
  it("rejects an empty body", () => {
    const result = newApplicationRules.safeParse({});

    expect(result.success).toBe(false);
  });

  it("accepts a body with every field and coerces dates", () => {
    const result = newApplicationRules.safeParse({
      status: "APPLIED",
      appliedAt: "2026-03-01T12:00:00.000Z",
      notes: "Referred by Ada.",
      opportunityId: ID,
      resumeId: OTHER_ID,
      referralContactId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      status: "APPLIED",
      notes: "Referred by Ada.",
      opportunityId: ID,
      resumeId: OTHER_ID,
      referralContactId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",

      // Text in, Date out. Prisma will not accept the string, so this coercion
      // is the reason an application can be created from a plain JSON body.
      appliedAt: new Date("2026-03-01T12:00:00.000Z"),
    });
  });

  // Only the opportunity is required, because an application usually starts as
  // a posting saved for later, before a resume is picked or anything is sent.
  it("accepts a body with only the opportunity", () => {
    const result = newApplicationRules.safeParse({ opportunityId: ID });

    expect(result.success).toBe(true);
  });

  it("rejects a body with no opportunity", () => {
    const result = newApplicationRules.safeParse({ status: "SAVED" });

    expect(result.success).toBe(false);
  });

  // An absent status must stay absent rather than becoming a value here. The
  // database column carries @default(SAVED), and leaving the key out is what
  // lets that default be the single place the starting status is decided.
  it("leaves status out when it is not sent", () => {
    const result = newApplicationRules.safeParse({ opportunityId: ID });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ opportunityId: ID });
  });

  it("rejects a status that is not part of the allowed enums", () => {
    const result = newApplicationRules.safeParse({
      opportunityId: ID,
      status: "APPLYED",
    });

    expect(result.success).toBe(false);
  });

  it("rejects ids that are not in the right format", () => {
    expect(
      newApplicationRules.safeParse({ opportunityId: "not-a-uuid" }).success,
    ).toBe(false);

    expect(
      newApplicationRules.safeParse({ opportunityId: ID, resumeId: "nope" })
        .success,
    ).toBe(false);

    expect(
      newApplicationRules.safeParse({
        opportunityId: ID,
        referralContactId: "nope",
      }).success,
    ).toBe(false);
  });

  it("trims the notes", () => {
    const result = newApplicationRules.safeParse({
      opportunityId: ID,
      notes: "  Referred by Ada.  ",
    });

    expect(result.success).toBe(true);
    expect(result.data?.notes).toBe("Referred by Ada.");
  });

  it("rejects notes that are too long", () => {
    const result = newApplicationRules.safeParse({
      opportunityId: ID,
      notes: "a".repeat(5001),
    });

    expect(result.success).toBe(false);
  });

  // This is the security behaviour, and it is what stops a client from choosing
  // who an application belongs to. userId is not in the schema, so it is dropped
  // here and the route supplies the id from the verified token instead.
  it("strips fields that are not in the schema", () => {
    const result = newApplicationRules.safeParse({
      opportunityId: ID,
      userId: OTHER_ID,
      statusChangedAt: "2020-01-01T00:00:00.000Z",
      banana: 7,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ opportunityId: ID });
  });
});

// Express hands over every query parameter as text, so each test feeds strings
// in and checks the parsed value that comes out.
describe("applicationQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = applicationQueryRules.safeParse({});

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });

  it("accepts every parameter and coerces the numbers", () => {
    const result = applicationQueryRules.safeParse({
      page: "2",
      limit: "10",
      status: "INTERVIEWING",
      opportunityId: ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 2,
      limit: 10,
      status: "INTERVIEWING",
      opportunityId: ID,
    });
  });

  it("rejects a page below 1", () => {
    expect(applicationQueryRules.safeParse({ page: "0" }).success).toBe(false);
    expect(applicationQueryRules.safeParse({ page: "-5" }).success).toBe(false);
  });

  it("rejects a limit above the maximum", () => {
    expect(applicationQueryRules.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects a page that is not a whole number", () => {
    expect(applicationQueryRules.safeParse({ page: "abc" }).success).toBe(false);
    expect(applicationQueryRules.safeParse({ page: "1.5" }).success).toBe(false);
  });

  it("rejects a status that is not part of the allowed enums", () => {
    expect(applicationQueryRules.safeParse({ status: "APPLYED" }).success).toBe(
      false,
    );
  });

  it("rejects an opportunity id not in the right format", () => {
    expect(
      applicationQueryRules.safeParse({ opportunityId: "not-a-guid" }).success,
    ).toBe(false);
  });

  // A parameter that is not declared must never reach the service and become a
  // filter. userId is the one that matters: a client must not be able to ask for
  // someone else's applications by adding it to the query string.
  it("strips parameters that are not in the schema", () => {
    const result = applicationQueryRules.safeParse({
      page: "1",
      userId: OTHER_ID,
      banana: "7",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });
});

describe("updateApplicationRules", () => {
  // A PATCH is meant to carry only what changed, so one field on its own is the
  // normal case rather than a special one.
  it("accepts a single field", () => {
    const result = updateApplicationRules.safeParse({ status: "INTERVIEWING" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: "INTERVIEWING" });
  });

  it("accepts a body with every editable field and coerces dates", () => {
    const result = updateApplicationRules.safeParse({
      status: "APPLIED",
      appliedAt: "2026-03-01T12:00:00.000Z",
      notes: "Sent the tailored resume.",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      status: "APPLIED",
      appliedAt: new Date("2026-03-01T12:00:00.000Z"),
      notes: "Sent the tailored resume.",
    });
  });

  // null is how a client erases a value, and it has to survive parsing as null
  // rather than being turned into undefined. Prisma reads the two differently:
  // null clears the column, undefined leaves it alone.
  it("accepts null for the clearable fields", () => {
    const result = updateApplicationRules.safeParse({
      appliedAt: null,
      notes: null,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ appliedAt: null, notes: null });
  });

  // The column is not nullable in the database, so there is no such thing as an
  // application with no status. Catching it here keeps that impossible value
  // from reaching Postgres and coming back as a 500.
  it("rejects null for status", () => {
    expect(updateApplicationRules.safeParse({ status: null }).success).toBe(
      false,
    );
  });

  it("rejects a status that is not part of the allowed enums", () => {
    expect(updateApplicationRules.safeParse({ status: "APPLYED" }).success).toBe(
      false,
    );
  });

  it("rejects notes that are too long", () => {
    expect(
      updateApplicationRules.safeParse({ notes: "a".repeat(5001) }).success,
    ).toBe(false);
  });

  // opportunityId is missing from this schema on purpose. An application
  // pointed at a different posting is a different application, so the field is
  // dropped instead of being written, and the same goes for userId.
  it("strips fields that are not editable", () => {
    const result = updateApplicationRules.safeParse({
      status: "OFFER",
      opportunityId: ID,
      userId: OTHER_ID,
      statusChangedAt: "2020-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: "OFFER" });
  });
});

describe("applicationIdRules", () => {
  it("rejects a non-uuid string", () => {
    expect(applicationIdRules.safeParse("not-a-uuid").success).toBe(false);
  });

  it("accepts a uuid", () => {
    expect(applicationIdRules.safeParse(OTHER_ID).success).toBe(true);
  });
});
