// ---------------------------------------------------------------------------
// Application routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
//
// Every route in this file is mounted behind requireAuth in app.ts, and every
// call below passes req.userId to the service. An application is one person's
// record of applying somewhere, so that argument is what keeps one user's rows
// out of another's responses.
// ---------------------------------------------------------------------------

import { Router } from "express";

import {
  createApplication,
  deleteApplication,
  findApplication,
  listApplications,
  updateApplication,
} from "./application.service.ts";

import {
  applicationIdRules,
  applicationQueryRules,
  newApplicationRules,
  updateApplicationRules,
} from "./application.validation.ts";

export const applicationRoutes = Router();

applicationRoutes.get("/", async (req, res) => {
  // A query string is client input, so it gets checked exactly like a body.
  const result = applicationQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  // The ! tells TypeScript that userId is really there. requireAuth is mounted
  // in front of every route in this file and answers 401 when there is no valid
  // token, so by the time this line runs it has always been set.
  const applications = await listApplications(req.userId!, result.data);
  res.json(applications);
});

applicationRoutes.get("/:id", async (req, res) => {
  const id = applicationIdRules.safeParse(req.params.id);

  if (!id.success) {
    res.status(400).json({ error: "Invalid application id" });
    return;
  }

  const application = await findApplication(req.userId!, id.data);

  // Someone else's application comes back as null, so it gets the same 404 as
  // an id that does not exist at all. Answering 403 here would be a way to
  // confirm which ids are real, one guess at a time.
  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json(application);
});

applicationRoutes.post("/", async (req, res) => {
  const result = newApplicationRules.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid application data" });
    return;
  }

  const application = await createApplication(req.userId!, result.data);

  // Null means one of the ids in the body names no row, or names one belonging
  // to someone else. Both come back as the same message on purpose: saying
  // which id was the problem would confirm that another user's resume exists.
  if (!application) {
    res.status(400).json({ error: "Unknown opportunity, resume or contact" });
    return;
  }

  res.status(201).json(application);
});

applicationRoutes.patch("/:id", async (req, res) => {
  // The id is checked before the body. A bad id means there is no row to talk
  // about, so validating the fields first would spend work on a request that
  // cannot succeed either way.
  const id = applicationIdRules.safeParse(req.params.id);

  if (!id.success) {
    res.status(400).json({ error: "Invalid application id" });
    return;
  }

  const result = updateApplicationRules.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid application data" });
    return;
  }

  const application = await updateApplication(req.userId!, id.data, result.data);

  // Null covers both "no such id" and "not yours", for the same reason as the
  // read above. The service never updates a row it did not first match on
  // userId, so a guessed id changes nothing.
  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.status(200).json(application);
});

applicationRoutes.delete("/:id", async (req, res) => {
  const id = applicationIdRules.safeParse(req.params.id);

  if (!id.success) {
    res.status(400).json({ error: "Invalid application id" });
    return;
  }

  const deleted = await deleteApplication(req.userId!, id.data);

  if (!deleted) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  // 204 means "done, and there is nothing to send back". The row is gone, so
  // there is no object left to return, and .end() sends the status with no body.
  res.status(204).end();
});
