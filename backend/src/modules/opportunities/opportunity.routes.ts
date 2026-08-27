// ---------------------------------------------------------------------------
// Opportunity routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
// ---------------------------------------------------------------------------

import { Router } from "express";

import {
  createOpportunity,
  findOpportunity,
  listOpportunities,
} from "./opportunity.service.ts";

import {
  newOpportunityRules,
  opportunityIdRules,
  opportunityQueryRules,
} from "./opportunity.validation.ts";

export const opportunityRoutes = Router();

opportunityRoutes.get("/", async (req, res) => {
  // A query string is client input, so it gets checked exactly like a body.
  const result = opportunityQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const opportunities = await listOpportunities(result.data);
  res.json(opportunities);
});

opportunityRoutes.get("/:id", async (req, res) => {
  const id = opportunityIdRules.safeParse(req.params.id);

  if (!id.success) {
    res.status(400).json({ error: "Invalid opportunity id" });
    return;
  }

  const opportunity = await findOpportunity(id.data);

  if (!opportunity) {
    res.status(404).json({ error: "Opportunity not found" });
    return;
  }

  res.json(opportunity);
});

opportunityRoutes.post("/", async (req, res) => {
  const result = newOpportunityRules.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid opportunity data" });
    return;
  }

  const opportunity = await createOpportunity(result.data);
  res.status(201).json(opportunity);
});
