// ---------------------------------------------------------------------------
// Error handler
//
// The last stop for anything that throws. Keeps internal detail on the server
// and sends the client a safe, generic message.
//
// Express tells error middleware apart from normal middleware by counting
// parameters. Four means error handler, three means normal middleware, so all
// four are declared even though two are unused.
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Full detail stays in the server log, where only you can read it.
  console.error(err);

  // P2002 is Prisma's code for a unique constraint being broken, such as two
  // people claiming the same username. That is the client's situation rather
  // than a server fault, so it earns a 409 instead of the generic 500 below.
  if (err.code === "P2002") {
    res.status(409).json({ error: "That already exists" });
    return;
  }

  // Raw database errors name tables and columns, so the client gets none of
  // it. One generic message for every unexpected failure.
  res.status(500).json({ error: "Something went wrong" });
}

// Reached when no route matched at all. It answers with the method and path so
// a typo in a URL is obvious from the response, which beats a bare 404 during
// development.
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
}
