// ---------------------------------------------------------------------------
// App
//
// Builds the Express app but does not start it. server.ts is the only file
// that opens a port, so tests can import the app without one.
// ---------------------------------------------------------------------------

import express from "express";
import morgan from "morgan";

import { prisma } from "./lib/prisma.ts";

export function createApp() {
  const app = express();

  // Middleware order is execution order, so logging goes first to catch
  // every request.
  app.use(morgan("dev"));
  app.use(express.json());

  // Runs a real query instead of just returning ok, because a server that
  // cannot reach its database is not healthy.
  app.get("/", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.send("JTracker API is running smooth.");
  });

  return app;
}
