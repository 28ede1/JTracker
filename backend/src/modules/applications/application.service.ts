// ---------------------------------------------------------------------------
// Application service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called later by a test or a background job, not just by a web
// request.
//
// Every function takes userId first, and every query filters by it. An
// application is one person's record of applying somewhere, so that argument is
// the line between one user's rows and another's.
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

// An application row on its own is just a status and some dates, so a list of
// them is unreadable without the posting it belongs to. Only the fields the
// screen shows, since selecting the whole row would send every column of every
// opportunity on every page.
const opportunityPreview = {
  select: {
    id: true,
    title: true,
    type: true,
    company: { select: { id: true, name: true, logoUrl: true } },
  },
};

// Used on the single application view only. A list does not need to name the
// resume or the referral, and each one is another join per row.
const applicationDetail = {
  opportunity: opportunityPreview,
  resume: { select: { id: true, label: true } },
  referralContact: { select: { id: true, firstName: true, lastName: true } },
};

// userId is a separate argument rather than part of the options object on
// purpose. Options come from the query string and are the caller's wish list;
// userId comes from the verified token and is not negotiable. Keeping them
// apart makes it impossible to write ...req.query and accidentally let a client
// choose whose applications to read.
export function listApplications(
  userId: string,
  { page, limit, status, opportunityId }: ListApplicationsOptions,
) {
  const skip = (page - 1) * limit;

  return prisma.application.findMany({
    // Prisma ignores any key whose value is undefined, so an absent filter
    // drops out of the query on its own. userId is the one filter that is
    // always present, which is what makes this line the privacy boundary.
    where: {
      userId,
      status,
      opportunityId,
    },

    // Most recently moved first, so the applications you are actively working
    // sit at the top and the ones sitting untouched fall away. The id breaks
    // ties so paging never shows or skips a row.
    orderBy: [{ statusChangedAt: "desc" }, { id: "asc" }],
    skip,
    take: limit,
    include: { opportunity: opportunityPreview },
  });
}

// findFirst instead of findUnique because the lookup is no longer by id alone.
// findUnique only accepts unique fields, and "id and owner together" is not a
// unique index, so this is the query that expresses "this row, and only if it
// is yours". A row owned by someone else comes back as null.
export function findApplication(userId: string, id: string) {
  return prisma.application.findFirst({
    where: { id, userId },
    include: applicationDetail,
  });
}

// Returns null when a referenced row is missing or belongs to someone else.
//
// The three ids arrived from the client, and z.guid() only proved they are
// shaped like ids. Two of them point at rows this user owns, so they need a
// real lookup: without it, someone could attach another user's resume to their
// own application by guessing an id, and every read of that application would
// then hand back a resume that is not theirs.
export async function createApplication(
  userId: string,
  { opportunityId, resumeId, referralContactId, ...rest }: NewApplication,
) {
  // Runs the checks together rather than one after another, since none of them
  // depends on the answer to another. Promise.all waits for all three.
  //
  // The opportunity is shared reference data, the same for everybody, so it is
  // checked for existence only. The other two are personal, so their queries
  // also filter by userId. undefined means the client did not send that id, and
  // an absent optional field is not a failure.
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

  // null is what a lookup returns when it found nothing, so each check below
  // reads as "an id was sent, but no row came back".
  if (!opportunity) return null;
  if (resumeId && !resume) return null;
  if (referralContactId && !referralContact) return null;

  // userId is written last, after the client's data, so it cannot be overwritten
  // by a field that arrived in the request. The order of those two lines is the
  // whole guarantee that a client cannot file an application under somebody
  // else's account.
  return prisma.application.create({
    data: { ...rest, opportunityId, resumeId, referralContactId, userId },
    include: applicationDetail,
  });
}

// Returns null when the row does not exist or is not this user's, which is what
// lets the route answer 404 for both without revealing which one happened.
export async function updateApplication(
  userId: string,
  id: string,
  data: ApplicationUpdate,
) {
  // Read before write, for two reasons. It is the ownership check, and it is
  // the only way to know whether the status is actually changing, which the
  // next lines depend on.
  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { status: true },
  });

  if (!existing) return null;

  // statusChangedAt answers "how long has this been sitting here", which is
  // what the follow-up alerts are built on. The database sets it once at
  // creation and never again, so keeping it truthful is this function's job.
  //
  // The comparison matters: a PATCH that resends the same status, or that only
  // edits the notes, must not reset the clock and make a stale application look
  // freshly moved.
  const statusChanged =
    data.status !== undefined && data.status !== existing.status;

  // Safe to match on id alone now. The row was just confirmed to be this
  // user's, and userId is not editable by any route, so ownership cannot have
  // changed in between.
  return prisma.application.update({
    where: { id },
    data: {
      ...data,
      ...(statusChanged ? { statusChangedAt: new Date() } : {}),
    },
    include: applicationDetail,
  });
}

// deleteMany rather than delete, because delete only accepts unique fields in
// its where and would therefore remove a row by id no matter who owns it.
// deleteMany takes any filter, so userId belongs in the query itself instead of
// in a check around it.
//
// It also reports a count rather than throwing when nothing matched, so a
// guessed id is an ordinary "false" here instead of an error the route has to
// catch.
export async function deleteApplication(userId: string, id: string) {
  const result = await prisma.application.deleteMany({
    where: { id, userId },
  });

  return result.count === 1;
}
