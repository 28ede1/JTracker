// ---------------------------------------------------------------------------
// Research Report service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called later by a scraper or a test, not just by a web request.
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