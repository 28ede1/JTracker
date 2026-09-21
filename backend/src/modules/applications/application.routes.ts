// ---------------------------------------------------------------------------
// Application routes
//
// Reads the request, and if input is valid, calls the proper service and sends
// the response back to the client. Mounted behind requireAuth in app.ts, so
// req.userId is already verified by the time a handler runs.
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
  const result = applicationQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

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

  if (!application) {
    res.status(400).json({ error: "Unknown opportunity, resume or contact" });
    return;
  }

  res.status(201).json(application);
});

applicationRoutes.patch("/:id", async (req, res) => {
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
  res.status(204).end();
});
