// ---------------------------------------------------------------------------
// Company routes
//
// Reads the request, and if input is valid, calls the proper service and sends
// the response back to the client. Companies are shared reference data, the
// same rows for everybody, so these are mounted without requireAuth and nothing
// here is scoped to a user.
// ---------------------------------------------------------------------------

import { Router } from "express";

import { createCompany, listCompanies, findCompany } from "./company.service.ts";

import { companyQueryRules, newCompanyRules } from "./company.validation.ts";

export const companyRoutes = Router();

companyRoutes.get("/", async (req, res) => {
  const result = companyQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const companies = await listCompanies(result.data);
  res.json(companies);
});

companyRoutes.get("/:id", async (req, res) => {
  const company = await findCompany(req.params.id);

  if (!company) {
    res.status(404).json({ error: "Company not found"})
    return;
  }

  res.json(company);
});

companyRoutes.post("/", async (req, res) => {
  const result = newCompanyRules.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid company data" });
    return;
  }

  const company = await createCompany(result.data);
  res.status(201).json(company);
});
