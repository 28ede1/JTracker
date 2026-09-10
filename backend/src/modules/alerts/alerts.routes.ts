// ---------------------------------------------------------------------------
// Alert routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
//
// Every route in this file is mounted behind requireAuth in app.ts, so by the
// time a handler below runs the caller's token has already been verified and
// req.userId holds who they are. Every call passes that id to the service,
// which is what keeps one person's reminders out of another person's replies.
// ---------------------------------------------------------------------------

import { Router } from "express";

import {
    createAlert,
    deleteAlert,
    findAlert,
    listAlerts,
    DUPLICATE_ALERT,
    UNKNOWN_REFERENCE,
} from "./alerts.service.ts";

import { newAlertRules, alertIdRules, alertQueryRules } from "./alerts.validation.ts";

export const alertRoutes = Router();

alertRoutes.get("/", async (req, res) => {

    // A query string is client input, so it gets checked exactly like a body.
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

    // null covers both "no such alert" and "not yours". They share one answer on
    // purpose: a different response for the second would let someone confirm
    // which ids are real, one guess at a time.
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

    // An id that is well formed but points at nothing, or at somebody else's
    // row. 400 rather than 404, because the failure is about the body that was
    // sent rather than about the address that was requested.
    if (alert === UNKNOWN_REFERENCE) {
        res.status(400).json({ error: "Unknown application or contact" });
        return;
    }

    // 409 Conflict is the status for "the request is fine, but it clashes with
    // what is already stored". Nothing was written and nothing was lost: the
    // reminder the client asked for already exists, so a client that retries
    // after a dropped connection gets this instead of a second identical email.
    if (alert === DUPLICATE_ALERT) {
        res.status(409).json({ error: "That alert is already scheduled" });
        return;
    }

    const probe: string = alert.title;
    void probe;
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

    // 204 means "done, and there is nothing to send back". The row is gone, so
    // there is no object left to return, and .end() sends the status with no
    // body.
    res.status(204).end();
})
