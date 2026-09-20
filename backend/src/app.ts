// ---------------------------------------------------------------------------
// App
//
// This file creates the main backend object and attaches all the routes + 
// rules to determine how the server should respond to requests. It will 
// build the Express app but not start it (which server.ts does)
// ---------------------------------------------------------------------------

import cors from "cors";
import express from "express";
import morgan from "morgan";

import { prisma } from "./lib/prisma.ts";
import { alertRoutes } from "./modules/alerts/alert.routes.ts";
import { companyRoutes } from "./modules/companies/company.routes.ts";
import { contactRoutes } from "./modules/contacts/contact.routes.ts";
import { opportunityRoutes } from "./modules/opportunities/opportunity.routes.ts";
import { researchReportRoutes } from "./modules/research-reports/research-report.routes.ts";
import { resumeRoutes } from "./modules/resumes/resume.routes.ts";
import { applicationRoutes } from "./modules/applications/application.routes.ts";
import { publicUserRoutes } from "./modules/users/user.public.routes.ts";
import { fitAnalysisRoutes } from "./modules/fit-analyses/fit-analysis.routes.ts";
import { userRoutes } from "./modules/users/user.routes.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { requireAuth } from "./middleware/require-auth.ts";

export function createApp() {
  const app = express();

  // -------------------------------------------------------------------------
  // How the list below is read
  //
  // Think of the .use and .get calls that follow as a list of ordered functions to try,
  // depending on what arrives from the client. Express runs one, then waits. It
  // only moves to the next when that function calls next(). A function that
  // sends a response and never calls next() ends the walk, so everything below
  // it is skipped.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Cross-origin requests
  //
  // The frontend is served from another origin (localhost:5173 in development),
  // and a browser will not hand a response from one origin to a page on
  // another unless the server says it is allowed. cors adds that permission
  // header. The origin is an allowlist read from the environment. First in the list
  // because a browser sends a preflight OPTIONS request before the real one, and 
  // that has to be answered before any route or guard gets a say.
  // -------------------------------------------------------------------------
  app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173" }));

  // Logs the request and its status, then calls next() right away.
  app.use(morgan("dev"));

  // Parses a JSON body and calls next(). On broken JSON it calls next(err)
  // instead, which skips every route below and jumps straight to errorHandler.
  app.use(express.json());

  // Health check to ensure db can be accessed.
  app.get("/", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.send("JTracker API is running smooth.");
  });


  // Companies and opportunities and research reports are shared reference data, the same for
  // everybody, so neither is mounted behind a guard.
  app.use("/companies", companyRoutes);

  app.use("/opportunities", opportunityRoutes);

  app.use("/research-reports", researchReportRoutes);

  // Contacts belong to one person, so requireAuth runs first. It checks that a
  // valid session exists and puts that user's id on the request, which is what
  // every query in contact.service.ts filters by. Same thing with Resumes, Applications,
  // FitAnalyses, Alerts
  app.use("/contacts", requireAuth, contactRoutes);

  app.use("/resumes", requireAuth, resumeRoutes);

  app.use("/applications", requireAuth, applicationRoutes);

  app.use("/fit-analyses", requireAuth, fitAnalysisRoutes);

  app.use("/alerts", requireAuth, alertRoutes);

  // Someone choosing a username has to reach this route 
  // before they have an account, so there is no token to check and it has to
  // sit ahead of the guard. Every other "/users" path finds no match here, so
  // this router calls next()...
  app.use("/users", publicUserRoutes);

  app.use("/users", requireAuth, userRoutes)

  // Only reached when every function above called next(), which is what
  // "nothing matched" actually means. It has to stay below the routes.
  app.use(notFoundHandler);

  // The last stop when something throws. It takes four arguments, so Express
  // only reaches it through next(err) and never during a normal request.
  app.use(errorHandler);

  return app;
}
