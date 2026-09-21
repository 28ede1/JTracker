// ---------------------------------------------------------------------------
// Resume upload middleware
//
// The frontend sends a file as multipart/form-data, a request format that
// express.json() cannot read, so Multer parses the request instead. It checks
// the file's reported type and size, holds its bytes in server memory, and
// hands the file to the route as req.file.
//
// frontend -> Multer -> req.file -> route -> service -> Supabase Storage
// ---------------------------------------------------------------------------

import multer from "multer";

import { FileType } from "../../../generated/prisma/enums.ts";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

// A MIME type is the short label a browser uses to say what kind of file it
// sent, such as "application/pdf". This maps the accepted ones onto the Prisma
// FileType stored on the Resume row.
export const MIME_TO_FILE_TYPE = {
  "application/pdf": FileType.PDF,
} as const;

export const ALLOWED_MIME_TYPES: string[] = Object.keys(MIME_TO_FILE_TYPE);

export const parseResumeFile = multer({
  // Holds the uploaded bytes in server memory, reachable as req.file.buffer.
  storage: multer.memoryStorage(),

  limits: { fileSize: MAX_RESUME_BYTES },

  // The browser is what reports mimetype, so this is only a basic type check.
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
  },
});


