// ---------------------------------------------------------------------------
// Research Report routes
//
// Reads the request, and if input is valid, calls the proper service and sends
// the response back to the client. Research reports are shared reference data,
// the same rows for everybody, so these are mounted without requireAuth and
// nothing here is scoped to a user.
// ---------------------------------------------------------------------------

import { Router } from "express";

import { listResearchReports, createResearchReport, deleteResearchReport, findResearchReport } from "./research-report.service.ts";

import { newResearchReportRules, researchReportIdRules, researchReportQueryRules } from "./research-report.validation.ts";

export const researchReportRoutes = Router();

researchReportRoutes.get("/", async (req, res) => {
  const result = researchReportQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const researchReports = await listResearchReports(result.data);
  res.json(researchReports);
});

researchReportRoutes.get("/:id", async (req, res) => {

    const result = researchReportIdRules.safeParse(req.params.id);

  if (!result.success) {
    res.status(400).json({ error: "Invalid research report ID" });
    return;
  }

  const researchReport = await findResearchReport(result.data);

  if (!researchReport) {
    res.status(404).json({ error: "Research report not found"})
    return;
  }

  res.json(researchReport);
});

researchReportRoutes.delete("/:id", async (req, res) => {

  const result = researchReportIdRules.safeParse(req.params.id);

  if (!result.success) {
    res.status(400).json({ error: "Invalid research report ID" });
    return;
  }

  const deleted = await deleteResearchReport(result.data);

  if (!deleted) {
    res.status(404).json({ error: "Research report not found"})
    return;
  }

  res.status(204).end();
});

researchReportRoutes.post("/", async (req, res) => {
  const result = newResearchReportRules.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid research report data" });
    return;
  }

  const researchReport = await createResearchReport(result.data);
  res.status(201).json(researchReport);
});
