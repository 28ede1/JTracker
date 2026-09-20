// ---------------------------------------------------------------------------
// Alert service
//
// Directly talks to database. Meant to be called only after client input has
// been normalized and checked.
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

// Alert.dedupeKey carries a unique index, which is what makes "schedule this
// reminder" safe to run twice. Feature 5 sends real emails, so a double-clicked
// Save, or a retried background job, must not queue two identical ones.
//
// The key is built from the values that decide whether two alerts really are
// the same reminder: whose it is, what kind, what it points at, and when.
function buildDedupeKey(
  userId: string,
  { type, scheduledFor, applicationId, contactId }: NewAlert,
) {
  return [
    userId,
    type,
    // "none" rather than an empty string, so the parts stay readable when
    // someone has to debug why a duplicate was rejected.
    applicationId ?? "none",
    contactId ?? "none",
    // One fixed spelling of an instant in UTC, so the same moment produces the
    // same key whatever timezone the client sent it in.
    scheduledFor.toISOString(),
  ].join("|");
}

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

    orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
    skip,
    take: limit,
    ...alertPreview,
  });
}

// findFirst, because "this row, and only if it is yours" is not a unique index
// and findUnique only accepts unique fields. Someone else's row comes back as
// null, which is what lets the route answer 404 without revealing the id.
export function findAlert(userId: string, id: string) {
  return prisma.alert.findFirst({
    where: { id, userId },
    ...alertDetail,
  });
}

export async function createAlert(userId: string, data: NewAlert) {
  const { applicationId, contactId, ...rest } = data;

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

  if (applicationId && !application) return UNKNOWN_REFERENCE;
  if (contactId && !contact) return UNKNOWN_REFERENCE;

  try {
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return DUPLICATE_ALERT;
    }

    throw error;
  }
}

export async function deleteAlert(userId: string, id: string) {
  const result = await prisma.alert.deleteMany({
    where: { id, userId },
  });

  return result.count === 1;
}
