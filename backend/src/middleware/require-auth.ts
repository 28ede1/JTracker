// ---------------------------------------------------------------------------
// requireAuth
//
// Answers one question: who is making this request. It reads the access token
// the browser sends, asks Supabase who it belongs to, and puts that user id on
// the request for the routes below it.
//
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from "express";

import { supabase } from "../lib/supabase.ts";

// Express's Request type has no userId, so we add one. Declaring it here rather
// than in a separate types file keeps the field next to the only code that sets
// it. It is optional because requests that never passed through requireAuth
// genuinely do not have it.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // The header looks like "Bearer eyJhbGciOi...". Splitting on the space gives
  // the scheme and the token separately, so a malformed header fails here
  // instead of sending nonsense to Supabase.
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  // Expired, tampered with, or belonging to a deleted user all land here. The
  // client is told none of that, because which reason it was is only useful to
  // someone probing for a way in.
  if (error || !data.user) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  
  // sets the userId over the request field
  req.userId = data.user.id;
  next();
}
