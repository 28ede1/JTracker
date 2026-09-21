// ---------------------------------------------------------------------------
// Research Report validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these.
// ---------------------------------------------------------------------------

import { z } from "zod";

import { ReportType } from "../../../generated/prisma/enums.ts";

// The body of POST /research-reports. The client only names what to research:
// contentMd, sources, model, status, generatedAt and expiresAt are the
// server's. Reports are shared, so a client cannot supply their content.
export const newResearchReportRules = z.object({
    reportType: z.enum(ReportType),


    companyId: z.guid(),

    // Optional, because research can be about a company on its own or tied to
    // one posting.
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