// ---------------------------------------------------------------------------
// Fit Analysis routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
//
// Every route in this file is mounted behind requireAuth in app.ts, and every
// call below passes req.userId to the service.
// ---------------------------------------------------------------------------

import { Router } from "express";

import { 
    createFitAnalysis, 
    deleteFitAnalysis, 
    listFitAnalyses, 
    findFitAnalysis 
} from "./fit-analysis.service.ts";

import {newFitAnalysisRules, fitAnalysisIdRules, fitAnalysisQueryRules} from "./fit-analysis.validation.ts"

export const fitAnalysisRoutes = Router();

fitAnalysisRoutes.get("/", async (req, res) => {

    const result = fitAnalysisQueryRules.safeParse(req.query);

    if (!result.success) {
        res.status(400).json({ error: "Invalid query parameters"});
        return;
    }

    const fitAnalyses = await listFitAnalyses(req.userId!, result.data);
    res.json(fitAnalyses);
})

fitAnalysisRoutes.get("/:id", async (req, res) => {

    const id = fitAnalysisIdRules.safeParse(req.params.id);

    if (!id.success) {
        res.status(400).json({ error: "Invalid fit analysis id"});
        return;
    }

    const fitAnalysis = await findFitAnalysis(req.userId!, id.data);

    if (!fitAnalysis) {
        res.status(404).json({ error: "Fit Analysis not found"})
        return;
    }

    res.json(fitAnalysis);
})

fitAnalysisRoutes.delete("/:id", async (req, res) => {

    const id = fitAnalysisIdRules.safeParse(req.params.id);

    if (!id.success) {
        res.status(400).json({ error: "Invalid fit analysis id"});
        return;
    }

    const deleted = await deleteFitAnalysis(req.userId!, id.data);

    if (!deleted) {
        res.status(404).json({ error: "Fit Analysis not found"})
        return;
    }
    
    res.status(204).end();
})

fitAnalysisRoutes.post("/", async (req, res) => {

    const result = newFitAnalysisRules.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({ error: "Invalid fit analysis data"});
        return;
    }

    const fitAnalysis = await createFitAnalysis(req.userId!, result.data);

    if (!fitAnalysis) {
        res.status(400).json({ error: "Unknown opportunity or resume"})
        return;
    }
    
    res.status(201).json(fitAnalysis);
})