// ---------------------------------------------------------------------------
// App
//
// Builds the Express app but does not start it. server.ts is the only file
// that opens a port, so tests can import the app without one.
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

  // think of the following .use and .get functions as a list of
  // functions to try running depending on what is recieved from client.
  // express runs one, then waits. it only moves to the next one when that
  // function calls next(). a function that sends a response and never calls
  // next() ends the walk, so everything below it is skipped.
  // order matters, express reads this list top to bottom.

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

  // log request to check status, calls next() right away
  app.use(morgan("dev"));

  // parse json body, calls next(). on broken json it calls next(err) instead,
  // which skips every route below and jumps straight to errorHandler
  app.use(express.json());

  // check if url is "/" for health check. sends a response and never calls
  // next(), so nothing below runs
  app.get("/", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.send("JTracker API is running smooth.");
  });


  // check if URL starts with "/companies" to access company routes
  app.use("/companies", companyRoutes);

  // check if URL starts with "/opportunities" to access opportunity routes
  app.use("/opportunities", opportunityRoutes);

  // check if URL starts with "/contacts" and if it does,
  // run middleware to check that a valid session exists and get user id from
  // the session token, before handling contactRoutes
  app.use("/contacts", requireAuth, contactRoutes);

  // two mountings on the same "/users" prefix, and the order is the whole
  // point. express tries this one first. it only knows the path
  // "/users/availability", which someone choosing a username has to reach
  // before they have an account, so it sits ahead of requireAuth. every other
  // "/users" path finds no match here, so this router calls next()
  app.use("/users", publicUserRoutes);

  // ...and lands here, where requireAuth runs first and answers 401 without a
  // valid token. adding a route to userRoutes therefore gets the guard by
  // default, which is the safe direction for a mistake to fall
  app.use("/users", requireAuth, userRoutes)

  // only reached when every function above called next(), which is what
  // "nothing matched" actually means. has to stay below the routes
  app.use(notFoundHandler);

  // check if something broke. takes four arguments, so express only reaches it
  // through next(err) and never during a normal request
  app.use(errorHandler);

  return app;
}
