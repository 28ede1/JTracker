// ---------------------------------------------------------------------------
// Public user routes
//
// The one part of the user module that answers without a token, kept in its own
// file so that "this is reachable by anybody" is visible from the filename
// rather than buried in the middle of the guarded routes.
//
// Only the sign-up form needs this. Someone choosing a username does not have
// an account yet, so there is no token to check and requireAuth cannot run in
// front of it.
//
// The reply is a bare true or false. Knowing that a name is taken is the whole
// point, but nothing else is given away: no id, no created date, no way to tell
// which account holds it. That is the smallest answer that still does the job.
// ---------------------------------------------------------------------------

import { Router } from "express";

import { isUsernameTaken } from "./user.service.ts";
import { usernameQueryRules } from "./user.validation.ts";

export const publicUserRoutes = Router();

publicUserRoutes.get("/availability", async (req, res) => {
  // A query string is client input, so it gets checked exactly like a body.
  // Refusing here also means a missing or oversized name never reaches the
  // database, which keeps this cheap endpoint cheap.
  const result = usernameQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid username" });
    return;
  }

  const taken = await isUsernameTaken(result.data.username);

  // available rather than taken, because the form asks "can I have this one".
  // Phrasing the field the way the caller thinks avoids a negation at every
  // call site, where a misread ! would silently invert the meaning.
  res.json({ available: !taken });
});
