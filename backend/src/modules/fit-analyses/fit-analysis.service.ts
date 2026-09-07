// ---------------------------------------------------------------------------
// Fit Analysis service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called later by a test or a background job, not just by a web
// request.
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

        orderBy: [{createdAt: "desc"}, { id: "asc"}],
        skip,
        take: limit,
        include: { opportunity: opportunityPreview}
    })
}

export function findFitAnalysis( userId: string, id: string ) {
    return prisma.fitAnalysis.findFirst({
        where: {id, userId},
        select: fitAnalysisDetail
    })
}

export async function createFitAnalysis(
    userId: string,
    { resumeId, opportunityId} : NewFitAnalysis,
) {
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

export async function deleteFitAnalysis(userId: string, id: string) {
    const result = await prisma.fitAnalysis.deleteMany({
      where: { id, userId },
    });
  
    return result.count === 1;
  }