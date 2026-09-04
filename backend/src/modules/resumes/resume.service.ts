// ---------------------------------------------------------------------------
// Resume service
//
// Talks to storage and the database. Nothing here knows about Express or
// Multer, so these functions can also be called by a test or a background job.
// That is why the caller passes plain values rather than handing over req.file.
//
// A resume lives in two places at once: the bytes go to Supabase Storage, and a
// Resume row records where they went. Those are separate systems, so no single
// transaction covers both and either half can fail on its own.
//
// That is what decides the order below. The file goes up first, because a
// stored file that no row names is invisible to the app and can be cleaned up
// later, while a row naming a file that was never stored breaks every read of
// it. When both cannot succeed, fail toward the state that is still repairable.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

import { FileType } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";

// A bucket is Supabase Storage's version of a top level folder. This one is
// private, so nothing in it is reachable by URL.
const RESUME_BUCKET = "resumes";

// How each format is spelled at the end of a stored filename. Storage cares
// about this, the upload filter does not, so it lives here.
const FILE_EXTENSION = {
  [FileType.PDF]: "pdf",
  [FileType.DOCX]: "docx",
} as const;

// Only what the caller can decide at creation time, which is why this is
// shorter than the Resume row. filePath is computed below, parseStatus has a
// schema default of PENDING, and parsedText is filled in later by the job that
// extracts the text.
type NewResume = {
  label: string;
  fileType: FileType;
  mimeType: string;
  fileSize: number;
  buffer: Buffer;
};

// userId stays a separate argument for the same reason as in contact.service.ts:
// the object is the client's wish list, and userId comes from the verified
// token and is not negotiable.
export async function createResume(
  userId: string,
  { label, fileType, mimeType, fileSize, buffer }: NewResume,
) {
  // Generated here, never taken from file.originalname. A filename typed on
  // someone else's computer is client input: it can contain "../" to climb out
  // of the folder, or collide with another user's file. A random uuid under the
  // owner's id can do neither.
  //
  // supabaseAdmin skips the database's own ownership rules, so this line is
  // what keeps one user's files out of another's folder. Building it in one
  // place is why filePath is not a parameter.
  const filePath = `${userId}/${randomUUID()}.${FILE_EXTENSION[fileType]}`;

  const upload = await supabaseAdmin.storage
    .from(RESUME_BUCKET)
    .upload(filePath, buffer, {
      // The format label Storage returns when the file is downloaded later.
      contentType: mimeType,

      // Refuse to overwrite. The uuid makes a collision essentially impossible,
      // so this turns "impossible" into "cannot happen silently".
      upsert: false,
    });

  // The Supabase client returns errors in the result instead of throwing.
  if (upload.error) {
    throw upload.error;
  }

  // The bytes are stored but nothing points at them yet. If this insert fails,
  // the file would sit in the bucket forever with no row naming it, so remove
  // it before passing the error on.
  try {
    return await prisma.resume.create({
      data: { label, filePath, fileType, fileSize, userId },
    });
  } catch (error) {
    await supabaseAdmin.storage.from(RESUME_BUCKET).remove([filePath]);
    throw error;
  }
}
