// ---------------------------------------------------------------------------
// App
//
// Builds the Express app but does not start it. server.ts is the only file
// that opens a port, so tests can import the app without one.
//
// This is also the one file that decides which routes are public and which sit
// behind a token, so the whole shape of the API is readable in one screen.
// ---------------------------------------------------------------------------

import cors from "cors";
import express from "express";
import morgan from "morgan";

import { prisma } from "./lib/prisma.ts";
import { companyRoutes } from "./modules/companies/company.routes.ts";
import { contactRoutes } from "./modules/contacts/contact.routes.ts";
import { opportunityRoutes } from "./modules/opportunities/opportunity.routes.ts";
import { publicUserRoutes } from "./modules/users/user.public.routes.ts";
import { userRoutes } from "./modules/users/user.routes.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { requireAuth } from "./middleware/require-auth.ts";

export function createApp() {
  const app = express();

  // -------------------------------------------------------------------------
  // How the list below is read
  //
  // Think of the .use and .get calls that follow as a list of functions to try,
  // depending on what arrives from the client. Express runs one, then waits. It
  // only moves to the next when that function calls next(). A function that
  // sends a response and never calls next() ends the walk, so everything below
  // it is skipped.
  //
  // Order matters, because Express reads this list from top to bottom.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Cross-origin requests
  //
  // The frontend is served from another origin (localhost:5173 in development),
  // and a browser will not hand a response from one origin to a page on
  // another unless the server says it is allowed. cors adds that permission
  // header. Nothing changes for supertest or curl, because the rule is one
  // browsers enforce, not one the server enforces.
  //
  // origin is an allowlist read from the environment, not "*". A wildcard here
  // would let any website on the internet call this API using a visitor's
  // browser, and later, once cookies or credentials are involved, that becomes
  // a real hole rather than a theoretical one. Naming the one origin allowed
  // keeps the default closed.
  //
  // First in the list because a browser sends a preflight OPTIONS request
  // before the real one, and that has to be answered before any route or guard
  // gets a say.
  // -------------------------------------------------------------------------
  app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173" }));

  // Logs the request and its status, then calls next() right away.
  app.use(morgan("dev"));

  // Parses a JSON body and calls next(). On broken JSON it calls next(err)
  // instead, which skips every route below and jumps straight to errorHandler.
  app.use(express.json());

  // The health check. The query is what makes it worth having: an app that
  // replies but cannot reach the database is broken in the way that matters, so
  // this proves the connection rather than just the process being alive.
  //
  // It sends a response and never calls next(), so nothing below runs.
  app.get("/", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.send("JTracker API is running smooth.");
  });


  // Companies and opportunities are shared reference data, the same for
  // everybody, so neither is mounted behind a guard.
  app.use("/companies", companyRoutes);

  app.use("/opportunities", opportunityRoutes);

  // Contacts belong to one person, so requireAuth runs first. It checks that a
  // valid session exists and puts that user's id on the request, which is what
  // every query in contact.service.ts filters by.
  app.use("/contacts", requireAuth, contactRoutes);

  // -------------------------------------------------------------------------
  // Two routers on one "/users" prefix
  //
  // The order is the whole point. Express tries this one first, and it knows
  // only "/users/availability". Someone choosing a username has to reach that
  // before they have an account, so there is no token to check and it has to
  // sit ahead of the guard. Every other "/users" path finds no match here, so
  // this router calls next()...
  // -------------------------------------------------------------------------
  app.use("/users", publicUserRoutes);

  // ...and lands here, where requireAuth runs first and answers 401 without a
  // valid token. A route added to userRoutes therefore gets the guard by
  // default, which is the safe direction for a mistake to fall in.
  app.use("/users", requireAuth, userRoutes)

  // Only reached when every function above called next(), which is what
  // "nothing matched" actually means. It has to stay below the routes.
  app.use(notFoundHandler);

  // The last stop when something throws. It takes four arguments, so Express
  // only reaches it through next(err) and never during a normal request.
  app.use(errorHandler);

  return app;
}
