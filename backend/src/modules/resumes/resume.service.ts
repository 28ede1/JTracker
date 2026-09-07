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
//
// Deleting follows the same rule and therefore runs in the opposite order: the
// row goes first, then the bytes. Both directions leave the same survivable
// mess if the second half fails, which is a file with no row pointing at it.
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

type ListResumeOptions = {
  page: number;
  limit: number;
  label?: string;
}

export function listResumes(
  userId: string,
  { page, limit, label }: ListResumeOptions,
) {
  const skip = (page - 1) * limit;

  return prisma.resume.findMany({
    where: {
      userId,
      label,
    },
    select: {
      id: true,
      label: true,
      fileType: true,
      fileSize: true,
      parseStatus: true,
      createdAt: true,
    },
    orderBy: [
      { createdAt: "desc" },
      { label: "asc" },
    ],
    skip,
    take: limit,
  });
}

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
      select: {
        id: true,
        label: true,
        fileType: true,
        fileSize: true,
        parseStatus: true,
        createdAt: true,
      },
    });
  } catch (error) {
    await supabaseAdmin.storage.from(RESUME_BUCKET).remove([filePath]);
    throw error;
  }
}

export async function deleteResume(userId: string, id: string) {
  // Read before deleting, because the row is the only record of where the bytes
  // live. deleteMany reports how many rows it removed but does not hand back
  // their contents, so once it has run, filePath is unrecoverable.
  const resume = await prisma.resume.findFirst({
    where: { id, userId },
    select: { filePath: true },
  });

  if (!resume) return false;

  // deleteMany rather than delete, for the same reason as in
  // application.service.ts: delete only accepts unique fields in its where, so
  // it would remove a row by id no matter who owns it. deleteMany takes any
  // filter, which keeps userId inside the query itself.
  //
  // Keeping userId here rather than trusting the lookup above also settles a
  // race. If two requests delete the same resume at once, both can pass the
  // findFirst, but only one deleteMany reports a count of 1. The other returns
  // false and never touches storage, so the file is removed exactly once.
  const result = await prisma.resume.deleteMany({
    where: { id, userId },
  });

  if (result.count !== 1) return false;

  // The row is gone, so nothing in the app can reach this file any more. Only
  // now are the bytes removed.
  //
  // remove takes an array because Storage can delete several paths in one call.
  // Here it is always one path.
  const removal = await supabaseAdmin.storage
    .from(RESUME_BUCKET)
    .remove([resume.filePath]);

  // Deliberately not thrown. From the caller's side the delete succeeded: the
  // resume is gone from the app and cannot be listed or downloaded again.
  // Turning this into a 500 would tell the user their delete failed when it did
  // not, and a retry would then answer 404 and still leave the file behind.
  //
  // What is left is an unreferenced file in the bucket, so the path is logged
  // where the server can see it and a cleanup job can find it later.
  if (removal.error) {
    console.error("Resume row deleted but file remains in storage", {
      filePath: resume.filePath,
      error: removal.error,
    });
  }

  return true;
}