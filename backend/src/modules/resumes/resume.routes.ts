// ---------------------------------------------------------------------------
// Resume routes
//
// Handles the web side: read the request, check the input, call the service,
// validates according to multer configs set it resumeUpload
// send a response. No database code here.
//
// Every route in this file is mounted behind requireAuth in app.ts, and every
// call below passes req.userId to the service. Resumes belong to one person,
// so that argument is what keeps one user's rows out of another's responses.
// ---------------------------------------------------------------------------


import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { createResume } from "./resume.service.ts";
import {
  MAX_RESUME_BYTES,
  MIME_TO_FILE_TYPE,
  parseResumeFile,
} from "./resume.upload.middleware.ts";
import { newResumeRules } from "./resume.validation.ts";

export const resumeRoutes = Router();

// Express tells an error handler apart from normal middleware by counting
// parameters: four means error handler. Registered on the router below, after
// the routes, so it sees anything they passed along with next(err).
//
// Without it an oversized file reaches errorHandler, matches nothing there, and
// comes back as a generic 500 for what is really the client's mistake.
function handleUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    const megabytes = MAX_RESUME_BYTES / (1024 * 1024);
    res.status(413).json({ error: `Resume must be ${megabytes} MB or smaller` });
    return;
  }

  next(err);
}

resumeRoutes.post(
  "/",
  parseResumeFile.single("resume"),
  async (req, res) => {
    // Multer puts the uploaded file here. It is undefined when no file part was
    // sent, and also when fileFilter rejected the format, because rejecting is
    // a silent drop rather than an error.
    if (!req.file) {
      res.status(400).json({
        error: "A PDF or DOCX resume is required",
      });

      return;
    }

    // req.body is empty until multer has read the multipart body, which is why
    // this sits after resumeUpload rather than in front of it.
    const result = newResumeRules.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: "Invalid resume data" });
      return;
    }

    // Derived from the file, never read from the body. fileFilter already
    // rejected anything outside this map, so a miss cannot happen here.
    const fileType =
      MIME_TO_FILE_TYPE[req.file.mimetype as keyof typeof MIME_TO_FILE_TYPE];

    const resume = await createResume(req.userId!, {
      label: result.data.label,
      fileType,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      buffer: req.file.buffer,
    });

    res.status(201).json(resume);
  },
);

// Below the routes, because Express reads this list top to bottom and an error
// handler only gets a turn once something above it has failed.
resumeRoutes.use(handleUploadError);
