// ---------------------------------------------------------------------------
// Alerts validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these.
// ---------------------------------------------------------------------------

import { z } from "zod";

import { AlertType, AlertStatus } from "../../../generated/prisma/enums.ts";

// The body of POST /alerts. status, sentAt and dedupeKey are missing on
// purpose: the server owns those three.
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
});

// The id in GET and DELETE /alerts/:id.
export const alertIdRules = z.guid();
