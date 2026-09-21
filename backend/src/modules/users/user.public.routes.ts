// ---------------------------------------------------------------------------
// Public user routes
//
// The one part of the user module that answers without a token, in its own file
// so that "reachable by anybody" is visible from the filename. Only the sign-up
// form needs it: someone choosing a username has no account yet, so requireAuth
// cannot run in front. The reply is a bare true or false, so nothing about the
// account holding that name is given away.
// ---------------------------------------------------------------------------

import { Router } from "express";

import { isUsernameTaken } from "./user.service.ts";
import { usernameQueryRules } from "./user.validation.ts";

export const publicUserRoutes = Router();

publicUserRoutes.get("/availability", async (req, res) => {
  const result = usernameQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid username" });
    return;
  }

  const taken = await isUsernameTaken(result.data.username);

  // available rather than taken, because the form asks "can I have this one".
  res.json({ available: !taken });
});
