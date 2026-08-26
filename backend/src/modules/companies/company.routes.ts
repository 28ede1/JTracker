// ---------------------------------------------------------------------------
// Company routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
// ---------------------------------------------------------------------------

import { Router } from "express";

import { createCompany, listCompanies, findCompany } from "./company.service.ts";

import { newCompanyRules } from "./company.schema.ts";

export const companyRoutes = Router();

companyRoutes.get("/", async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const companies = await listCompanies(page, limit);

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
