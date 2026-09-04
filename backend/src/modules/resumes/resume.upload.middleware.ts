// ---------------------------------------------------------------------------
// Resume upload middleware
//
// The frontend sends a file using multipart/form-data rather than JSON.
// express.json() cannot read that format, so Multer parses the request.
//
// For an accepted upload, Multer:
// 1. reads the file from the request,
// 2. checks its reported type and size,
// 3. temporarily stores its bytes in server memory, and
// 4. makes the file available to the route as req.file.
//
// The route then passes req.file to the service, which uploads the bytes to
// Supabase Storage and creates the associated Resume database row.
//
// Upload flow:
// frontend -> Multer -> req.file -> route -> service -> Supabase Storage
// ---------------------------------------------------------------------------

import multer from "multer";

import { FileType } from "../../../generated/prisma/enums.ts";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

// Browsers describe an uploaded file using a MIME type. This map accepts PDF
// and DOCX files and converts their MIME types into the Prisma FileType values
// stored in the Resume database row.
export const MIME_TO_FILE_TYPE = {
  "application/pdf": FileType.PDF,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    FileType.DOCX,
} as const;

const ALLOWED_MIME_TYPES: string[] = Object.keys(MIME_TO_FILE_TYPE);

export const parseResumeFile = multer({
  // Holds the uploaded file's raw bytes temporarily in server memory.
  // The route can access those bytes through req.file.buffer.
  storage: multer.memoryStorage(),

  // Stops the upload and reports an error when the file exceeds 5 MB.
  limits: { fileSize: MAX_RESUME_BYTES },

  // Accepts only files reported by the browser as PDF or DOCX.
  // Because the browser supplies this value, this is only a basic type check.
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
  },
});


