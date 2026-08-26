// ---------------------------------------------------------------------------
// App
//
// Builds the Express app but does not start it. server.ts is the only file
// that opens a port, so tests can import the app without one.
// ---------------------------------------------------------------------------

import express from "express";
import morgan from "morgan";

import { prisma } from "./lib/prisma.ts";
import { companyRoutes } from "./modules/companies/company.routes.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";

export function createApp() {
  const app = express();

  // think of the following .use and .get functions as a list of
  // functions to try running depending on what is recieved from client.
  // express runs one, then waits. it only moves to the next one when that
  // function calls next(). a function that sends a response and never calls
  // next() ends the walk, so everything below it is skipped.
  // order matters, express reads this list top to bottom.

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

  // only reached when every function above called next(), which is what
  // "nothing matched" actually means. has to stay below the routes
  app.use(notFoundHandler);

  // check if something broke. takes four arguments, so express only reaches it
  // through next(err) and never during a normal request
  app.use(errorHandler);

  return app;
}
