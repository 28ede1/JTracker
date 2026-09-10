// ---------------------------------------------------------------------------
// Alert service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called by a test, or later by the background job that actually
// sends the follow-up emails, not just by a web request.
//
// Every function takes userId first, and every query filters by it. An alert is
// one person's reminder, so that argument is the line between one user's rows
// and another's.
// ---------------------------------------------------------------------------

import { Prisma } from "../../../generated/prisma/client.ts";
import type { AlertStatus, AlertType } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";

type ListAlertsOptions = {
  page: number;
  limit: number;
  type?: AlertType;
  status?: AlertStatus;
  applicationId?: string;
  contactId?: string;
};

// Only what the caller can decide at creation time, which is why this is
// shorter than the Alert row. status has a schema default of PENDING, sentAt is
// written by the job that sends the email, and dedupeKey is built below.
type NewAlert = {
  type: AlertType;
  title: string;
  body?: string;
  scheduledFor: Date;
  applicationId?: string;
  contactId?: string;
};

const alertPreview = {
  select: {
    id: true,
    type: true,
    title: true,
    scheduledFor: true,
    status: true,
    sentAt: true,
    application: {
      select: {
        id: true,
        status: true,
        opportunity: { select: { id: true, title: true } },
      },
    },
    contact: { select: { id: true, firstName: true, lastName: true } },
  },
};

const alertDetail = {
  select: {
    id: true,
    type: true,
    title: true,
    body: true,
    scheduledFor: true,
    status: true,
    sentAt: true,
    createdAt: true,
    application: {
      select: {
        id: true,
        status: true,
        opportunity: { select: { id: true, title: true } },
      },
    },
    contact: { select: { id: true, firstName: true, lastName: true } },
  },
};

export const UNKNOWN_REFERENCE = "unknown-reference" as const;
export const DUPLICATE_ALERT = "duplicate" as const;

// ---------------------------------------------------------------------------
// dedupeKey
//
// Alert.dedupeKey is a required column with a unique index, so every row has to
// carry one and no two rows can share it. The point is to make "create this
// reminder" safe to run more than once. Once the background job exists it will
// scan for applications sitting untouched and queue follow-ups, and a job that
// runs twice, or a user who double-clicks Save, must not produce two identical
// emails.
//
// The key is built from the values that decide whether two alerts are really
// the same reminder: who it belongs to, what kind it is, what it points at, and
// when it is due. Change any of those and it is a different alert.
// ---------------------------------------------------------------------------
function buildDedupeKey(
  userId: string,
  { type, scheduledFor, applicationId, contactId }: NewAlert,
) {
  // "none" rather than an empty string so the parts stay readable in the
  // database when someone has to debug why a duplicate was rejected.
  return [
    userId,
    type,
    applicationId ?? "none",
    contactId ?? "none",
    // toISOString gives one fixed spelling of an instant in UTC, so the same
    // moment always produces the same key no matter what timezone the client
    // sent it in.
    scheduledFor.toISOString(),
  ].join("|");
}

// userId is a separate argument rather than part of the options object on
// purpose. Options come from the query string and are the caller's wish list;
// userId comes from the verified token and is not negotiable. Keeping them
// apart makes it impossible to write ...req.query and accidentally let a client
// choose whose alerts to read.
export function listAlerts(
  userId: string,
  { page, limit, type, status, applicationId, contactId }: ListAlertsOptions,
) {
  const skip = (page - 1) * limit;

  return prisma.alert.findMany({
    where: {
      userId,
      type,
      status,
      applicationId,
      contactId,
    },

    // Soonest first, unlike the other modules, which sort by newest created.
    // An alert list answers "what is coming up", so the reminder due tomorrow
    // belongs above the one queued yesterday for next month. The schema already
    // carries an index on (status, scheduledFor), so the database can walk this
    // order instead of sorting every matching row on each request.
    //
    // The id breaks ties, so two alerts due at the same instant always come
    // back in the same order and paging never shows or skips a row.
    orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
    skip,
    take: limit,
    ...alertPreview,
  });
}

// findFirst instead of findUnique because the lookup is no longer by id alone.
// findUnique only accepts unique fields, and "id and owner together" is not a
// unique index, so this is the query that expresses "this row, and only if it
// is yours". A row owned by someone else comes back as null, which is what lets
// the route answer 404 without revealing that the id is real.
export function findAlert(userId: string, id: string) {
  return prisma.alert.findFirst({
    where: { id, userId },
    ...alertDetail,
  });
}

// Returns UNKNOWN_REFERENCE when a referenced row is missing or belongs to
// someone else, and DUPLICATE_ALERT when this exact reminder already exists.
//
// The two ids arrived from the client, and z.guid() only proved they are shaped
// like ids. Both point at rows this user owns, so they need a real lookup:
// without it, someone could hang an alert off another user's application by
// guessing an id, and every read of that alert would then hand back the job
// title and status of an application that is not theirs.
export async function createAlert(userId: string, data: NewAlert) {
  const { applicationId, contactId, ...rest } = data;

  // Runs both checks together rather than one after another, since neither
  // depends on the answer to the other. Promise.all waits for both.
  //
  // undefined means the client did not send that id, and an absent optional
  // field is not a failure, so no query is issued for it at all.
  const [application, contact] = await Promise.all([
    applicationId
      ? prisma.application.findFirst({
          where: { id: applicationId, userId },
          select: { id: true },
        })
      : undefined,

    contactId
      ? prisma.contact.findFirst({
          where: { id: contactId, userId },
          select: { id: true },
        })
      : undefined,
  ]);

  // null is what a lookup returns when it found nothing, so each check below
  // reads as "an id was sent, but no row came back".
  if (applicationId && !application) return UNKNOWN_REFERENCE;
  if (contactId && !contact) return UNKNOWN_REFERENCE;

  try {
    // userId is written last, after the client's data, so it cannot be
    // overwritten by a field that arrived in the request. The order of those
    // lines is the whole guarantee that a client cannot file an alert under
    // somebody else's account.
    return await prisma.alert.create({
      data: {
        ...rest,
        applicationId,
        contactId,
        dedupeKey: buildDedupeKey(userId, data),
        userId,
      },
      ...alertDetail,
    });
  } catch (error) {
    // ---------------------------------------------------------------------
    // Why the duplicate is caught here instead of checked for beforehand
    //
    // The obvious version reads the table first and only inserts when nothing
    // matched. That has a gap: two requests can both read "nothing there" a
    // millisecond apart, and both then insert. The check and the write are two
    // separate trips to the database, and nothing stops another request
    // landing in between.
    //
    // The unique index does not have that gap, because the database applies it
    // as part of the insert itself. So the insert is simply attempted, and the
    // one that loses is told it lost. P2002 is Prisma's code for "a unique
    // constraint was violated"; every other error is re-thrown untouched so a
    // genuine database fault still surfaces as a 500 rather than being
    // mislabelled a duplicate.
    // ---------------------------------------------------------------------
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return DUPLICATE_ALERT;
    }

    throw error;
  }
}

// deleteMany rather than delete, because delete only accepts unique fields in
// its where and would therefore remove a row by id no matter who owns it.
// deleteMany takes any filter, so userId belongs in the query itself instead of
// in a check around it.
//
// It also reports a count rather than throwing when nothing matched, so a
// guessed id is an ordinary "false" here instead of an error the route has to
// catch.
export async function deleteAlert(userId: string, id: string) {
  const result = await prisma.alert.deleteMany({
    where: { id, userId },
  });

  return result.count === 1;
}
