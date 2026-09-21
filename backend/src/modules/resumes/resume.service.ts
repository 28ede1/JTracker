// ---------------------------------------------------------------------------
// Resume service
//
// Directly talks to storage and the database. Meant to be called only after
// client input has been normalized and checked.
//
// A resume lives in two places: the bytes in Supabase Storage and a Resume row
// naming where they went. No transaction covers both, so creating uploads the
// file first and deleting removes the row first. Either order can leave a file
// with no row, which is survivable; a row naming a missing file is not.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

import { FileType } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";

// A bucket is Supabase Storage's version of a top level folder. This one is
// private, so nothing in it is reachable by URL.
const RESUME_BUCKET = "resumes";

// How each format is spelled at the end of a stored filename.
const FILE_EXTENSION = {
  [FileType.PDF]: "pdf",
  [FileType.DOCX]: "docx",
} as const;

// Only what the caller decides at creation time. filePath is computed below,
// and parseStatus and parsedText are filled in later.
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
    // Newest first, since the version you just uploaded is the one you want.
    orderBy: [
      { createdAt: "desc" },
      { label: "asc" },
    ],
    skip,
    take: limit,
  });
}

export async function createResume(
  userId: string,
  { label, fileType, mimeType, fileSize, buffer }: NewResume,
) {
  // Generated here, never taken from file.originalname. A filename from someone
  // else's computer is client input: it can contain "../" to climb out of the
  // folder, or collide with another user's file. A random uuid under the
  // owner's id can do neither.
  const filePath = `${userId}/${randomUUID()}.${FILE_EXTENSION[fileType]}`;

  const upload = await supabaseAdmin.storage
    .from(RESUME_BUCKET)
    .upload(filePath, buffer, {
      // The format label Storage returns when the file is downloaded later.
      contentType: mimeType,

      // Refuse to overwrite, so a collision fails loudly instead of silently.
      upsert: false,
    });

  // The Supabase client returns errors in the result instead of throwing.
  if (upload.error) {
    throw upload.error;
  }

  // The bytes are stored but nothing points at them yet, so a failed insert has
  // to take the uploaded file back out.
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
  // live and deleteMany does not hand back what it removed.
  const resume = await prisma.resume.findFirst({
    where: { id, userId },
    select: { filePath: true },
  });

  if (!resume) return false;

  // deleteMany rather than delete, because delete only accepts unique fields and
  // would remove a row by id no matter who owns it. It also settles a race: if
  // two requests delete the same resume at once, only one gets a count of 1, so
  // the file is removed exactly once.
  const result = await prisma.resume.deleteMany({
    where: { id, userId },
  });

  if (result.count !== 1) return false;

  // The row is gone, so nothing in the app can reach this file any more. Only
  // now are the bytes removed.
  const removal = await supabaseAdmin.storage
    .from(RESUME_BUCKET)
    .remove([resume.filePath]);

  // Not thrown, because from the caller's side the delete succeeded. The path is
  // logged so a cleanup job can find the unreferenced file later.
  if (removal.error) {
    console.error("Resume row deleted but file remains in storage", {
      filePath: resume.filePath,
      error: removal.error,
    });
  }

  return true;
}