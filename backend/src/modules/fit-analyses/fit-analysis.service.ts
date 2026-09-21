// ---------------------------------------------------------------------------
// Fit Analysis service
//
// Directly talks to the database. Meant to be called only after client input
// has been normalized and checked. Every function takes userId first and every
// query filters by it.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts"

type ListFitAnalysisOptions = {
    page: number;
    limit: number;
}

type NewFitAnalysis = {
    resumeId: string;
    opportunityId: string;
}

const opportunityPreview = {
    select: {
      id: true,
      title: true,
      type: true,
      company: { select: { id: true, name: true, logoUrl: true } },
    },
};

const fitAnalysisDetail = {
    status: true,
    score: true,
    summary: true,
    strengths: true,
    gaps: true,
    model: true,
  
    opportunity: opportunityPreview,
  
    resume: {
      select: {
        id: true,
        label: true,
      },
    },
  };
  

export function listFitAnalyses(
    userId: string,
    { page, limit }: ListFitAnalysisOptions,
) {
    const skip = (page - 1) * limit;

    return prisma.fitAnalysis.findMany({
        where: {
            userId,
        },

        // Newest first. The id breaks ties so paging never shows or skips a row.
        orderBy: [{createdAt: "desc"}, { id: "asc"}],
        skip,
        take: limit,
        include: { opportunity: opportunityPreview}
    })
}

// findFirst, because "this row, and only if it is yours" is not a unique index
// and findUnique only accepts unique fields. Someone else's row comes back as
// null, which is what lets the route answer 404 without revealing the id.
export function findFitAnalysis( userId: string, id: string ) {
    return prisma.fitAnalysis.findFirst({
        where: {id, userId},
        select: fitAnalysisDetail
    })
}

// Returns null when either referenced row is missing or belongs to someone
// else. z.guid() only proved the ids are shaped like ids, not that they are
// this user's to use.
export async function createFitAnalysis(
    userId: string,
    { resumeId, opportunityId} : NewFitAnalysis,
) {
    // The opportunity is shared reference data, so it is checked for existence
    // only. The resume is personal, so its query also filters by userId.
    const [opportunity, resume] = await Promise.all([
        prisma.opportunity.findUnique({
            where: { id: opportunityId},
            select: {id: true},
        }),

        prisma.resume.findFirst({
            where: { id: resumeId, userId},
            select: {id:true}
        })
    ])

    if (!opportunity) return null;
    if (!resume) return null;

    return prisma.fitAnalysis.create({
        data: {
          resumeId,
          opportunityId,
          userId,
        },
        select: fitAnalysisDetail,
      });
}

// deleteMany rather than delete, because delete only accepts unique fields and
// would remove a row by id no matter who owns it.
export async function deleteFitAnalysis(userId: string, id: string) {
    const result = await prisma.fitAnalysis.deleteMany({
      where: { id, userId },
    });
  
    return result.count === 1;
  }