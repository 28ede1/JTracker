// ---------------------------------------------------------------------------
// Application service
//
// Directly talks to the database. Meant to be called only after client input
// has been normalized and checked. Every function takes userId first and every
// query filters by it.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts";
import type { ApplicationStatus } from "../../../generated/prisma/enums.ts";

type ListApplicationsOptions = {
  page: number;
  limit: number;
  status?: ApplicationStatus;
  opportunityId?: string;
};

type NewApplication = {
  opportunityId: string;
  status?: ApplicationStatus;
  appliedAt?: Date;
  notes?: string;
  resumeId?: string;
  referralContactId?: string;
};

// null and undefined mean different things here. undefined is a field the
// client left out, which Prisma skips. null is the client asking to clear the
// column. Both have to survive the trip from the route to the query untouched.
type ApplicationUpdate = {
  status?: ApplicationStatus;
  appliedAt?: Date | null;
  notes?: string | null;
};

const opportunityPreview = {
  select: {
    id: true,
    title: true,
    type: true,
    company: { select: { id: true, name: true, logoUrl: true } },
  },
};

const applicationDetail = {
  opportunity: opportunityPreview,
  resume: { select: { id: true, label: true } },
  referralContact: { select: { id: true, firstName: true, lastName: true } },
};

export function listApplications(
  userId: string,
  { page, limit, status, opportunityId }: ListApplicationsOptions,
) {
  const skip = (page - 1) * limit;

  return prisma.application.findMany({
    where: {
      userId,
      status,
      opportunityId,
    },

    orderBy: [{ statusChangedAt: "desc" }, { id: "asc" }],
    skip,
    take: limit,
    include: { opportunity: opportunityPreview },
  });
}

export function findApplication(userId: string, id: string) {
  return prisma.application.findFirst({
    where: { id, userId },
    include: applicationDetail,
  });
}

export async function createApplication(
  userId: string,
  { opportunityId, resumeId, referralContactId, ...rest }: NewApplication,
) {

  const [opportunity, resume, referralContact] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true },
    }),

    resumeId
      ? prisma.resume.findFirst({
          where: { id: resumeId, userId },
          select: { id: true },
        })
      : undefined,

    referralContactId
      ? prisma.contact.findFirst({
          where: { id: referralContactId, userId },
          select: { id: true },
        })
      : undefined,
  ]);

  if (!opportunity) return null;
  if (resumeId && !resume) return null;
  if (referralContactId && !referralContact) return null;

  return prisma.application.create({
    data: { ...rest, opportunityId, resumeId, referralContactId, userId },
    include: applicationDetail,
  });
}

export async function updateApplication(
  userId: string,
  id: string,
  data: ApplicationUpdate,
) {
  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { status: true },
  });

  if (!existing) return null;

  const statusChanged =
    data.status !== undefined && data.status !== existing.status;


  return prisma.application.update({
    where: { id },
    data: {
      ...data,
      ...(statusChanged ? { statusChangedAt: new Date() } : {}),
    },
    include: applicationDetail,
  });
}

export async function deleteApplication(userId: string, id: string) {
  const result = await prisma.application.deleteMany({
    where: { id, userId },
  });

  return result.count === 1;
}
