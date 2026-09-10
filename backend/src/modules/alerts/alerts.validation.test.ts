// ---------------------------------------------------------------------------
// Alert validation tests
//
// No database and no HTTP here. These call the rule sets directly, which is
// what makes them fast enough to run on every save. The route tests cover the
// same rules end to end, but only for the handful of cases worth paying a
// network round trip for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  newAlertRules,
  alertQueryRules,
  alertIdRules,
} from "./alerts.validation.ts";

// Valid uuids reused across the tests, so a failure is never about the shape of
// an id when the test is about something else.
const APPLICATION_ID = "550e8400-e29b-41d4-a716-446655440000";
const CONTACT_ID = "3f1c1b2e-9a4d-4f0e-8b3a-2c5d6e7f8a90";
const OTHER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

// One fixed instant, written the way JSON carries a date: as a string. Naming
// it once keeps every test below comparing against the same moment.
const SCHEDULED_FOR = "2026-06-01T09:00:00.000Z";

describe("newAlertRules", () => {
  it("rejects an empty body", () => {
    const result = newAlertRules.safeParse({});

    expect(result.success).toBe(false);
  });

  // The smallest alert that makes sense: what kind it is, what it says, and
  // when it is due. Neither id is required, because a deadline reminder does
  // not have to point at an application or a contact.
  it("accepts the three required fields on their own", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "Application closes",
      scheduledFor: SCHEDULED_FOR,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      type: "DEADLINE_REMINDER",
      title: "Application closes",
      scheduledFor: new Date(SCHEDULED_FOR),
    });
  });

  it("accepts every field the client is allowed to send", () => {
    const result = newAlertRules.safeParse({
      type: "APPLICATION_FOLLOW_UP",
      title: "Chase the recruiter",
      body: "Two weeks with no reply.",
      scheduledFor: SCHEDULED_FOR,
      applicationId: APPLICATION_ID,
      contactId: CONTACT_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      type: "APPLICATION_FOLLOW_UP",
      title: "Chase the recruiter",
      body: "Two weeks with no reply.",
      scheduledFor: new Date(SCHEDULED_FOR),
      applicationId: APPLICATION_ID,
      contactId: CONTACT_ID,
    });
  });

  // "coerce" means the rule converts before it checks. JSON has no date type,
  // so scheduledFor always arrives as text. Prisma needs a real Date object to
  // write a timestamp column, and this is the line that produces one.
  it("turns the scheduled date from text into a real Date", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "Due",
      scheduledFor: SCHEDULED_FOR,
    });

    expect(result.success).toBe(true);
    expect(result.data?.scheduledFor).toBeInstanceOf(Date);
    expect(result.data?.scheduledFor.toISOString()).toBe(SCHEDULED_FOR);
  });

  it("rejects a scheduled date that is not a date", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "Due",
      scheduledFor: "not-a-date",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing scheduled date", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "Due",
    });

    expect(result.success).toBe(false);
  });

  // The enum comes from the generated Prisma client, so this test is really
  // checking that the rules and the database agree on the vocabulary. Postgres
  // refuses an unknown enum value outright, which would surface as a 500 for
  // what is really the client's mistake.
  it("rejects a type that is not one of the allowed values", () => {
    const result = newAlertRules.safeParse({
      type: "SOMETHING_ELSE",
      title: "Due",
      scheduledFor: SCHEDULED_FOR,
    });

    expect(result.success).toBe(false);
  });

  it("accepts every type the schema declares", () => {
    for (const type of [
      "APPLICATION_FOLLOW_UP",
      "CONTACT_FOLLOW_UP",
      "DEADLINE_REMINDER",
    ]) {
      const result = newAlertRules.safeParse({
        type,
        title: "Due",
        scheduledFor: SCHEDULED_FOR,
      });

      expect(result.success).toBe(true);
    }
  });

  // trim runs before min(1), so whitespace is removed first and then the length
  // is checked against what is left. Without the trim, a title of three spaces
  // would pass and show up as a blank row in the user's list.
  it("trims the title and rejects one that is only whitespace", () => {
    const trimmed = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "  Chase the recruiter  ",
      scheduledFor: SCHEDULED_FOR,
    });

    expect(trimmed.success).toBe(true);
    expect(trimmed.data?.title).toBe("Chase the recruiter");

    const blank = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "   ",
      scheduledFor: SCHEDULED_FOR,
    });

    expect(blank.success).toBe(false);
  });

  // The ceiling is not about tidiness. Without it, one request could store a
  // megabyte of text in a column that every list view reads on every page.
  it("rejects a title past the maximum length", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "a".repeat(201),
      scheduledFor: SCHEDULED_FOR,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a body past the maximum length", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "Due",
      body: "a".repeat(5001),
      scheduledFor: SCHEDULED_FOR,
    });

    expect(result.success).toBe(false);
  });

  it("rejects ids that are not in the right format", () => {
    expect(
      newAlertRules.safeParse({
        type: "APPLICATION_FOLLOW_UP",
        title: "Due",
        scheduledFor: SCHEDULED_FOR,
        applicationId: "not-a-uuid",
      }).success,
    ).toBe(false);

    expect(
      newAlertRules.safeParse({
        type: "CONTACT_FOLLOW_UP",
        title: "Due",
        scheduledFor: SCHEDULED_FOR,
        contactId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  // A JSON body can contain any type, not just strings. A number where a title
  // belongs has to be refused here, because Postgres rejects it as a type error
  // and that surfaces as a 500 for what is really the client's mistake.
  it("rejects a title that is not a string", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: 7,
      scheduledFor: SCHEDULED_FOR,
    });

    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // The security behaviour of this schema
  //
  // Zod's z.object drops any key it was not told about, so the parsed value can
  // only ever contain the six declared fields. That is what stops a client from
  // choosing who the alert belongs to: userId never survives parsing, and the
  // route supplies it from the verified token instead.
  // -------------------------------------------------------------------------
  it("strips a userId sent in the body", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "Due",
      scheduledFor: SCHEDULED_FOR,
      userId: OTHER_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      type: "DEADLINE_REMINDER",
      title: "Due",
      scheduledFor: new Date(SCHEDULED_FOR),
    });
  });

  // The other half of the same rule, and the one specific to this module.
  // status, sentAt and dedupeKey belong to the server. status only moves when
  // the email job runs, sentAt records when it actually went out, and dedupeKey
  // is built inside the service. Leaving all three out of the schema is what
  // makes writing them impossible rather than merely discouraged.
  //
  // sentAt is the dangerous one. A client that could set it would be able to
  // mark a reminder as already delivered, and the job that sends pending alerts
  // would then skip it forever.
  it("strips the fields the server owns", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: "Due",
      scheduledFor: SCHEDULED_FOR,
      status: "SENT",
      sentAt: "2026-01-01T00:00:00.000Z",
      dedupeKey: "anything-i-like",
      id: OTHER_ID,
      createdAt: "2026-01-01T00:00:00.000Z",
      banana: 7,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      type: "DEADLINE_REMINDER",
      title: "Due",
      scheduledFor: new Date(SCHEDULED_FOR),
    });
  });
});

// Express hands over every query parameter as text, so each test feeds strings
// in and checks the parsed value that comes out.
describe("alertQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = alertQueryRules.safeParse({});

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });

  // "coerce" again, this time on numbers. The string "2" becomes the number 2,
  // which matters because the service does arithmetic on page to work out how
  // many rows to skip, and "2" - 1 is not something to rely on.
  it("accepts every filter and coerces the numbers", () => {
    const result = alertQueryRules.safeParse({
      page: "2",
      limit: "10",
      type: "CONTACT_FOLLOW_UP",
      status: "PENDING",
      applicationId: APPLICATION_ID,
      contactId: CONTACT_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 2,
      limit: 10,
      type: "CONTACT_FOLLOW_UP",
      status: "PENDING",
      applicationId: APPLICATION_ID,
      contactId: CONTACT_ID,
    });
  });

  it("rejects a page below 1", () => {
    expect(alertQueryRules.safeParse({ page: "0" }).success).toBe(false);
    expect(alertQueryRules.safeParse({ page: "-5" }).success).toBe(false);
  });

  // The ceiling is the reason this rule exists at all. Without it a client could
  // ask for a million rows in one request and make the database do that work.
  it("rejects a limit above the maximum", () => {
    expect(alertQueryRules.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects a limit below 1", () => {
    expect(alertQueryRules.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("rejects a page that is not a whole number", () => {
    expect(alertQueryRules.safeParse({ page: "abc" }).success).toBe(false);
    expect(alertQueryRules.safeParse({ page: "1.5" }).success).toBe(false);
  });

  it("rejects a status that is not one of the allowed values", () => {
    expect(alertQueryRules.safeParse({ status: "MAYBE" }).success).toBe(false);
  });

  it("rejects a type that is not one of the allowed values", () => {
    expect(alertQueryRules.safeParse({ type: "SOMETHING_ELSE" }).success).toBe(
      false,
    );
  });

  it("rejects a filter id that is not a uuid", () => {
    expect(
      alertQueryRules.safeParse({ applicationId: "not-a-uuid" }).success,
    ).toBe(false);

    expect(alertQueryRules.safeParse({ contactId: "not-a-uuid" }).success).toBe(
      false,
    );
  });

  // A parameter that is not declared must never reach the service and become a
  // filter. userId is the one that matters: a client must not be able to ask for
  // someone else's alerts by adding it to the query string.
  it("strips parameters that are not in the schema", () => {
    const result = alertQueryRules.safeParse({
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

describe("alertIdRules", () => {
  it("accepts a uuid", () => {
    expect(alertIdRules.safeParse(APPLICATION_ID).success).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    expect(alertIdRules.safeParse("not-a-uuid").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(alertIdRules.safeParse("").success).toBe(false);
  });
});
