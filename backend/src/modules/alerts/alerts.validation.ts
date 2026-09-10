// ---------------------------------------------------------------------------
// Alerts input validation
//
// The trust boundary for the alerts module.
//
// Each rule set rejects bad input, converts text into real types, and strips
// undeclared fields. Routes call them, services never do, so a service always
// receives values that are already valid.
// ---------------------------------------------------------------------------

import { z } from "zod";

import { AlertType, AlertStatus } from "../../../generated/prisma/enums.ts";

// The body of POST /alerts.
// Three columns on the Alert row are deliberately absent from every rule below,
// because they are the server's to write.:
//
// status     starts at PENDING and only the job that sends the email moves it
// sentAt     the moment that email actually went out
// dedupeKey  built inside the service, from the values the client did send
export const newAlertRules = z.object({
    type: z.enum(AlertType),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(5000).optional(),
    scheduledFor: z.coerce.date(),
    applicationId: z.guid().optional(),
    contactId: z.guid().optional(),
  });

// The query string of GET /alerts.
export const alertQueryRules = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    type: z.enum(AlertType).optional(),
    status: z.enum(AlertStatus).optional(),
    contactId: z.guid().optional(),
    applicationId: z.guid().optional(),

})

// The id in GET and DELETE /alerts/:id.
export const alertIdRules = z.guid();
