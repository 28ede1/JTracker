// ---------------------------------------------------------------------------
// Resume routes
//
// Reads the request, and if input is valid, calls the proper service and sends
// the response back to the client. Mounted behind requireAuth in app.ts, so
// req.userId is already verified by the time a handler runs.
//
// A POST passes through the upload middleware first, so req.file already exists
// by the time a handler reads it. Of everything on that request, the label is
// the only value the client types.
// ---------------------------------------------------------------------------


import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { createResume, deleteResume, listResumes } from "./resume.service.ts";
import { MAX_RESUME_BYTES, MIME_TO_FILE_TYPE, parseResumeFile, } from "./resume.upload.middleware.ts";
import { newResumeRules, resumeIdRules, resumeQueryRules} from "./resume.validation.ts";

export const resumeRoutes = Router();

// Express tells an error handler apart from normal middleware by counting
// parameters: four means error handler. Without this one, an oversized file
// comes back as a generic 500 for what is really the client's mistake.
function handleUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const megabytes = MAX_RESUME_BYTES / (1024 * 1024);
      res.status(413).json({ error: `Resume must be ${megabytes} MB or smaller` });
      return;
    }

    // Every other MulterError means the upload itself was malformed, most often
    // a file sent on a field name other than "resume".
    res.status(400).json({ error: "Invalid resume upload" });
    return;
  }

  next(err);
}

resumeRoutes.get("/", async (req, res) => {
  const result = resumeQueryRules.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters"})
    return;
  }

  const resumes = await listResumes(req.userId!, result.data);
  res.json(resumes);
})

resumeRoutes.post(
  "/",
  parseResumeFile.single("resume"),
  async (req, res) => {
    // Multer puts the uploaded file here. It is undefined when no file was sent,
    // and also when fileFilter rejected the format, since that is a silent drop.
    if (!req.file) {
      res.status(400).json({
        error: "A PDF resume is required",
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

    // Derived from the file, never read from the body.
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

resumeRoutes.delete("/:id", async (req, res) => {
  const id = resumeIdRules.safeParse(req.params.id);

  if (!id.success) {
    res.status(400).json({ error: "Invalid resume id" });
    return;
  }

  const deleted = await deleteResume(req.userId!, id.data);

  if (!deleted) {
    res.status(404).json({ error: "Resume not found" });
    return;
  }

  res.status(204).end();
});

// Below the routes, because Express reads this list top to bottom.
resumeRoutes.use(handleUploadError);
