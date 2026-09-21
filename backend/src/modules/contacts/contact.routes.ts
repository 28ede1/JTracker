// ---------------------------------------------------------------------------
// Contact routes
//
// Reads the request, and if input is valid, calls the proper service and sends
// the response back to the client. Mounted behind requireAuth in app.ts, so
// req.userId is already verified by the time a handler runs.
// ---------------------------------------------------------------------------

import { Router } from "express";

import {
  createContact,
  findContact,
  listContacts,
} from "./contact.service.ts";

import {
  newContactRules,
  contactIdRules,
  contactQueryRules,
} from "./contact.validation.ts";

export const contactRoutes = Router();

contactRoutes.get("/", async (req, res) => {
  const result = contactQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const contacts = await listContacts(req.userId!, result.data);
  res.json(contacts);
});

contactRoutes.get("/:id", async (req, res) => {
  const id = contactIdRules.safeParse(req.params.id);

  if (!id.success) {
    res.status(400).json({ error: "Invalid contact id" });
    return;
  }

  const contact = await findContact(req.userId!, id.data);

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json(contact);
});

contactRoutes.post("/", async (req, res) => {
  const result = newContactRules.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid contact data" });
    return;
  }

  const contact = await createContact(req.userId!, result.data);
  res.status(201).json(contact);
});
