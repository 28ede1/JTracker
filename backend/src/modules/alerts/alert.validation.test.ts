// ---------------------------------------------------------------------------
// Alert validation tests
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  newAlertRules,
  alertQueryRules,
  alertIdRules,
} from "./alert.validation.ts";

const APPLICATION_ID = "550e8400-e29b-41d4-a716-446655440000";
const CONTACT_ID = "3f1c1b2e-9a4d-4f0e-8b3a-2c5d6e7f8a90";
const OTHER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const SCHEDULED_FOR = "2026-06-01T09:00:00.000Z";

describe("newAlertRules", () => {
  it("rejects an empty body", () => {
    const result = newAlertRules.safeParse({});

    expect(result.success).toBe(false);
  });

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

  it("rejects a title that is not a string", () => {
    const result = newAlertRules.safeParse({
      type: "DEADLINE_REMINDER",
      title: 7,
      scheduledFor: SCHEDULED_FOR,
    });

    expect(result.success).toBe(false);
  });

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

describe("alertQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = alertQueryRules.safeParse({});

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });

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

  // Without a ceiling a client could ask for a million rows in one request.
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
