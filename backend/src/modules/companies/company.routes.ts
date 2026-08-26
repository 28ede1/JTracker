// ---------------------------------------------------------------------------
// Company routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
// ---------------------------------------------------------------------------

import { Router } from "express";
import { z } from "zod";

import { createCompany, listCompanies, findCompany } from "./company.service.ts";

export const companyRoutes = Router();

companyRoutes.get("/", async (_req, res) => {
  const companies = await listCompanies();
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

// Describes what a valid POST body looks like. Data from a client is never
// trusted, so it gets checked before it reaches the database. Extra fields passed in
// that are not one of the following described get stripped away.
export const newCompanyRules = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
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
