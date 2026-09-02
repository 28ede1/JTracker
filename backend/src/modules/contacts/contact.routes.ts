// ---------------------------------------------------------------------------
// Contact routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
//
// Every route in this file is mounted behind requireAuth in app.ts, and every
// call below passes req.userId to the service. Contacts belong to one person,
// so that argument is what keeps one user's rows out of another's responses.
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
  // A query string is client input, so it gets checked exactly like a body.
  const result = contactQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  // The ! tells TypeScript that userId is really there. requireAuth is mounted
  // in front of every route in this file and answers 401 when there is no valid
  // token, so by the time this line runs it has always been set.
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

  // Someone else's contact comes back as null, so it gets the same 404 as an id
  // that does not exist at all. Answering 403 here would be a way to confirm
  // which ids are real, one guess at a time.
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
