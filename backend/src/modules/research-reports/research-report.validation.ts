// ---------------------------------------------------------------------------
// Research Report input validation
//
// The trust boundary for the research report module.
//
// Each rule set rejects bad input, converts text into real types, and strips
// undeclared fields. Routes call them, services never do, so a service always
// receives values that are already valid.
// ---------------------------------------------------------------------------

import { z } from "zod";

import { ReportType } from "../../../generated/prisma/enums.ts";

// The body of POST /research-reports..
// Everything else on the ResearchReport model is intentionally absent.
// contentMd, sources and model are written by the service after the AI call
// returns. status, generatedAt and expiresAt are decided by the server. A
// research report is shared by every user viewing that company, so accepting
// generated content from a request body would let one user publish fake
// research to everyone else.
export const newResearchReportRules = z.object({
    reportType: z.enum(ReportType),


    companyId: z.guid(),

    opportunityId: z.guid().optional(),
})

// The query string of GET /research-reports.
export const researchReportQueryRules = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    
    reportType: z.enum(ReportType).optional(),
    companyId: z.guid().optional(),
})

// The id in GET and DELETE /research-reports/:id.
export const researchReportIdRules = z.guid();