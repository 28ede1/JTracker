// ---------------------------------------------------------------------------
// Research Report service
//
// Directly talks to the database. Meant to be called only after client input
// has been normalized and checked. No userId anywhere, unlike the other
// services: a report is about a company, so everyone reads the same rows.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts";
import type { ReportType } from "../../../generated/prisma/enums.ts";

type ListResearchReportsOptions = {
  page: number;
  limit: number;
  reportType?: ReportType;
  companyId?: string;
};

type NewResearchReport = {
  reportType: ReportType;
  companyId: string;
  opportunityId?: string;
};

// contentMd is the whole generated report, so it stays out of every response
// this service returns.
const researchReportPreview = {
  select: {
    id: true,
    reportType: true,
    companyId: true,
    opportunityId: true,
  },
};

export function listResearchReports({
  page,
  limit,
  reportType,
  companyId,
}: ListResearchReportsOptions) {
  const skip = (page - 1) * limit;

  return prisma.researchReport.findMany({
    where: {
      reportType,
      companyId,
    },
    // Newest first, since research goes stale.
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take: limit,
    ...researchReportPreview,
  });
}

export function findResearchReport(id: string) {
  return prisma.researchReport.findUnique({
    where: {
      id,
    },
    ...researchReportPreview,
  });
}

// deleteMany rather than delete, because delete throws when nothing matched.
// A count of zero is the "no such id" the route turns into a 404.
export async function deleteResearchReport(id: string) {
  const result = await prisma.researchReport.deleteMany({
    where: { id },
  });

  return result.count === 1;
}

export function createResearchReport(data: NewResearchReport) {
  return prisma.researchReport.create({
    data,
    ...researchReportPreview,
  });
}