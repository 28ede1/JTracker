// ---------------------------------------------------------------------------
// Fit Analysis routes
//
// Reads the request, and if input is valid, calls the proper service and sends
// the response back to the client. Mounted behind requireAuth in app.ts, so
// req.userId is already verified by the time a handler runs. There is no PATCH:
// the written judgement belongs to the AI call, not to the client.
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