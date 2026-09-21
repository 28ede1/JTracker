// ---------------------------------------------------------------------------
// Alert routes

// Reads the request, and if input is valid, calls the proper service and sends
// the response back to the client. Mounted behind requireAuth in app.ts, so 
// req.userId is already verified by the time a handler runs.
// ---------------------------------------------------------------------------

import { Router } from "express";

import {
    createAlert,
    deleteAlert,
    findAlert,
    listAlerts,
    DUPLICATE_ALERT,
    UNKNOWN_REFERENCE,
} from "./alert.service.ts";

import { newAlertRules, alertIdRules, alertQueryRules } from "./alert.validation.ts";

export const alertRoutes = Router();

alertRoutes.get("/", async (req, res) => {

    const result = alertQueryRules.safeParse(req.query);

    if (!result.success) {
        res.status(400).json({ error: "Invalid query parameters" });
        return;
    }

    const alerts = await listAlerts(req.userId!, result.data);
    res.json(alerts);
})

alertRoutes.get("/:id", async (req, res) => {

    const id = alertIdRules.safeParse(req.params.id);

    if (!id.success) {
        res.status(400).json({ error: "Invalid alert id" });
        return;
    }

    const alert = await findAlert(req.userId!, id.data);

    if (!alert) {
        res.status(404).json({ error: "Alert not found" });
        return;
    }

    res.json(alert);
})

alertRoutes.post("/", async (req, res) => {

    const result = newAlertRules.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({ error: "Invalid alert data" });
        return;
    }

    const alert = await createAlert(req.userId!, result.data);

    if (alert === UNKNOWN_REFERENCE) {
        res.status(400).json({ error: "Unknown application or contact" });
        return;
    }
    if (alert === DUPLICATE_ALERT) {
        res.status(409).json({ error: "That alert is already scheduled" });
        return;
    }

    res.status(201).json(alert);
})

alertRoutes.delete("/:id", async (req, res) => {

    const id = alertIdRules.safeParse(req.params.id);

    if (!id.success) {
        res.status(400).json({ error: "Invalid alert id" });
        return;
    }

    const deleted = await deleteAlert(req.userId!, id.data);

    if (!deleted) {
        res.status(404).json({ error: "Alert not found" });
        return;
    }

    res.status(204).end();
})
