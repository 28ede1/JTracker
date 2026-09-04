// ---------------------------------------------------------------------------
// Resume routes
//
// The entry point for the resume module. app.ts mounts this router at /resumes
// behind requireAuth, so by the time a handler below runs, the caller's token
// has already been verified and req.userId holds who they are.
//
// This file is the web side only: read the request, check the input, call the
// service, send a response. No storage or database code lives here.
//
// The rest of the module, in the order a request passes through it:
//
//   resume.routes.ts             this file, the HTTP layer
//   resume.upload.middleware.ts  pulls the uploaded file off the request
//   resume.validation.ts         checks the text fields the client typed
//   resume.service.ts            stores the bytes and writes the database row
//
// One rule shapes all four. Of everything arriving on this request, the label
// is the only value the client types. The user id comes from the verified
// token, the format and size are measured from the file itself, and the storage
// path is generated inside the service.
// ---------------------------------------------------------------------------


import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { createResume } from "./resume.service.ts";
import { MAX_RESUME_BYTES, MIME_TO_FILE_TYPE, parseResumeFile, } from "./resume.upload.middleware.ts";
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
