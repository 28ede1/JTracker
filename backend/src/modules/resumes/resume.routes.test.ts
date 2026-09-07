// ---------------------------------------------------------------------------
// Resume route tests
// ---------------------------------------------------------------------------

import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FileType } from "../../../generated/prisma/enums.ts";
import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";
import { createResume, deleteResume, listResumes } from "./resume.service.ts";
import { MAX_RESUME_BYTES} from "./resume.upload.middleware.ts";

const RESUME_BUCKET = "resumes";

const app = createApp();

// ---------------------------------------------------------------------------
// Credentials
//
// Every route in this file sits behind requireAuth, so there is nothing to test
// without a real signed-in user. When the two variables are missing the whole
// file skips instead of failing, so a fresh clone still runs green.
// See .env.example.
// ---------------------------------------------------------------------------

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

// ---------------------------------------------------------------------------
// Cleanup
// 
// In order to successfully clear all test data that was created (deleting 
// resume from data model table AND supabase storage), you must
// first get all filepaths from the test resumes in the resume table
// then delete the rows, THEN remove the files from supabase storage.
// If you flip the order you end up having no way to access the file paths
// that tell you where the files are stored on supabase.
// ---------------------------------------------------------------------------

const TEST_PREFIX = "Test "
function testName(label: string) {
    return `${TEST_PREFIX}${label}`;
  }

const OTHER_USER_PREFIX = "test-other-";

async function deleteTestData() {
    // applications first, they point at opportunities
    await prisma.application.deleteMany({
        where: { opportunity: { title: { startsWith: TEST_PREFIX } } },
    })

    await prisma.opportunity.deleteMany({
        where: { title: { startsWith: TEST_PREFIX } },
    })

    // get all file paths for deletion
    const resumes = await prisma.resume.findMany({
        where: { label: { startsWith: TEST_PREFIX}},
        select: { filePath: true },
    })

    // delete rows
    await prisma.resume.deleteMany({
        where: {label: { startsWith: TEST_PREFIX}  }
    })

    // bulk remove all filePaths
    if (resumes.length > 0) {
        const { error } = await supabaseAdmin.storage
        .from(RESUME_BUCKET)
        .remove(resumes.map((resume) => resume.filePath));

        if (error) {
            throw new Error(`Could not remove test resume files: ${error.message}`);
        }
    }

    await prisma.user.deleteMany({
        where: { username: { startsWith: OTHER_USER_PREFIX } },
    });
}

// In case there are any folders added to supabase storage
// that do not point at any resume row.

async function deleteStrandedFiles(userId: string) {
    // Each user's files live in a folder named after their id, so this reads one
    // user's folder only. list() returns the short name of each object, such as
    // "9f2c...pdf", not the full path, which is why the folder is put back in
    // front of it below. 1000 is Storage's maximum for one call and far more than
    // a test run ever creates.
    const { data: objects, error } = await supabaseAdmin.storage
      .from(RESUME_BUCKET)
      .list(userId, { limit: 1000 });
  
    if (error) {
      throw new Error(`Could not list test resume files: ${error.message}`);
    }
  
    if (!objects || objects.length === 0) return;
  
    const rows = await prisma.resume.findMany({
      where: { userId },
      select: { filePath: true },
    });
  
    // A Set rather than an array because the filter below asks "is this path in
    // here" once per stored file. A Set answers that in one step, while an array
    // would be scanned from the start every time.
    const referenced = new Set(rows.map((row) => row.filePath));
  
    const stranded = objects
      .map((object) => `${userId}/${object.name}`)
      .filter((path) => !referenced.has(path));
  
    if (stranded.length === 0) return;
  
    await supabaseAdmin.storage.from(RESUME_BUCKET).remove(stranded);
  }
  
  describe.skipIf(!email || !password)("resume routes", () => {
    let token = "";
    let userId = "";

    beforeAll(async () => {
        
        const client = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
          );

        const { data, error } = await client.auth.signInWithPassword({
            email: email!,
            password: password!,
        });

        if (error) {
            throw new Error(`Could not sign in as TEST_USER_EMAIL: ${error.message}`);
        }

        token = data.session!.access_token;
        userId = data.user!.id;

        await prisma.user.upsert({
            where: { id: userId },
            create: { id: userId, username: `test-user-${userId.slice(0, 8)}` },
            update: {},
          });
        
        await deleteTestData();
        await deleteStrandedFiles(userId);
    })

    afterEach(deleteTestData);

    // defined in one place instead of rewriting the same request handlers
    //
    // These sit outside beforeAll, not inside it. A function declared inside a
    // hook stops existing the moment that hook returns, so the tests below
    // would not be able to see it. They read token at call time, which is why
    // it is still an empty string up here.

    function get(path: string) {
    return request(app).get(path).set("Authorization", `Bearer ${token}`);
    }

    // POST /resumes carries a file, so it cannot use .send(). A file cannot
    // travel as JSON, so this request goes as multipart/form-data: a format
    // that splits the body into separate parts, one per value.
    //
    // .field adds a text part and .attach adds a file part. The name "resume"
    // has to match parseResumeFile.single("resume") in the route, or Multer
    // ignores the file and req.file arrives undefined.
    //
    // The mime type is never sent explicitly. Supertest infers it from the
    // filename extension, so "resume.pdf" becomes application/pdf and
    // "notes.txt" becomes text/plain. That inferred value is what fileFilter
    // then accepts or rejects.
    function upload(label: string, bytes: Buffer, filename = "resume.pdf") {
    return request(app)
        .post("/resumes")
        .set("Authorization", `Bearer ${token}`)
        .field("label", label)
        .attach("resume", bytes, filename);
    }

    function del(path: string) {
    return request(app).delete(path).set("Authorization", `Bearer ${token}`);
    }

    // stands in for a second person using the app
    function otherUser() {
      return prisma.user.create({
        data: {
          id: randomUUID(),
          username: `${OTHER_USER_PREFIX}${randomUUID().slice(0, 8)}`,
        },
      });
    }

    // there is no route for uploading as somebody else, so the service is
    // called directly. the scoping tests need a real file in the bucket.
    async function otherUsersResume(label: string) {
      const other = await otherUser();

      const created = await createResume(other.id, {
        label: testName(label),
        fileType: FileType.PDF,
        mimeType: "application/pdf",
        fileSize: 512,
        buffer: randomBytes(512),
      });

      return prisma.resume.findUniqueOrThrow({ where: { id: created.id } });
    }

    describe("POST /resumes", () => {
      it("creates a resume and returns 201", async () => {
        const response = await upload(testName("Backend v1"), randomBytes(1024));

        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.label).toBe(testName("Backend v1"));
      });

      // both are read from the file, never from the request body
      it("derives fileType and fileSize from the file", async () => {
        const bytes = randomBytes(1024);

        const response = await upload(testName("Measured"), bytes);

        expect(response.body.fileType).toBe("PDF");
        expect(response.body.fileSize).toBe(bytes.length);
      });

      it("starts a new resume at PENDING", async () => {
        const response = await upload(testName("Pending"), randomBytes(512));

        expect(response.body.parseStatus).toBe("PENDING");
      });

      // the service leaves filePath out of its select on purpose
      it("does not return the storage path", async () => {
        const response = await upload(testName("Hidden"), randomBytes(512));

        expect(response.body.filePath).toBeUndefined();
      });

      // ownership comes from the token, never from the request
      it("saves the resume against the signed-in user, ignoring any userId sent", async () => {
        const response = await request(app)
          .post("/resumes")
          .set("Authorization", `Bearer ${token}`)
          .field("label", testName("Owned"))
          .field("userId", randomUUID())
          .attach("resume", randomBytes(512), "resume.pdf");

        expect(response.status).toBe(201);

        const stored = await prisma.resume.findUniqueOrThrow({
          where: { id: response.body.id },
        });

        expect(stored.userId).toBe(userId);
      });

      it("trims the label", async () => {
        const response = await upload(`   ${testName("Padded")}   `, randomBytes(512));

        expect(response.status).toBe(201);
        expect(response.body.label).toBe(testName("Padded"));
      });

      it("does not save fields that are not in the schema", async () => {
        const response = await request(app)
          .post("/resumes")
          .set("Authorization", `Bearer ${token}`)
          .field("label", testName("Extra"))
          .field("banana", "7")
          .attach("resume", randomBytes(512), "resume.pdf");

        expect(response.status).toBe(201);
        expect(response.body.banana).toBeUndefined();
      });

      it("returns 400 when no file is sent", async () => {
        const response = await request(app)
          .post("/resumes")
          .set("Authorization", `Bearer ${token}`)
          .field("label", testName("No File"));

        expect(response.status).toBe(400);
      });

      // multer only looks at the field named "resume"
      it("returns 400 when the file is sent under the wrong field name", async () => {
        const response = await request(app)
          .post("/resumes")
          .set("Authorization", `Bearer ${token}`)
          .field("label", testName("Wrong Field"))
          .attach("file", randomBytes(512), "resume.pdf");

        expect(response.status).toBe(400);
      });

      it("returns 400 when the label is missing", async () => {
        const response = await request(app)
          .post("/resumes")
          .set("Authorization", `Bearer ${token}`)
          .attach("resume", randomBytes(512), "resume.pdf");

        expect(response.status).toBe(400);
      });

      it("returns 400 when the label is only whitespace", async () => {
        const response = await upload("     ", randomBytes(512));

        expect(response.status).toBe(400);
      });

      // "Test " is 5 characters, so 96 more makes 101
      it("returns 400 when the label is longer than 100 characters", async () => {
        const response = await upload(testName("a".repeat(96)), randomBytes(512));

        expect(response.status).toBe(400);
      });

      it("accepts a label of exactly 100 characters", async () => {
        const response = await upload(testName("a".repeat(95)), randomBytes(512));

        expect(response.status).toBe(201);
      });

      // fileFilter drops a rejected file silently, so the route sees no file
      it("returns 400 for a text file", async () => {
        const response = await upload(testName("Text"), randomBytes(512), "notes.txt");

        expect(response.status).toBe(400);
      });

      it("returns 400 for an image", async () => {
        const response = await upload(testName("Image"), randomBytes(512), "logo.png");

        expect(response.status).toBe(400);
      });

      // MIME_TO_FILE_TYPE only lists PDF, even though FileType has DOCX
      it("returns 400 for a docx file", async () => {
        const response = await upload(testName("Docx"), randomBytes(512), "resume.docx");

        expect(response.status).toBe(400);
      });

      // the name says pdf but the declared type does not, and the type wins
      it("returns 400 when a pdf filename carries a non pdf content type", async () => {
        const response = await request(app)
          .post("/resumes")
          .set("Authorization", `Bearer ${token}`)
          .field("label", testName("Liar"))
          .attach("resume", randomBytes(512), {
            filename: "resume.pdf",
            contentType: "text/plain",
          });

        expect(response.status).toBe(400);
      });

      // without handleUploadError this comes back as a 500
      it("returns 413 when the file is one byte over the limit", async () => {
        const response = await upload(testName("Too Big"), randomBytes(MAX_RESUME_BYTES + 1));

        expect(response.status).toBe(413);
      });

      it("accepts a file exactly at the limit", async () => {
        const response = await upload(testName("At Limit"), randomBytes(MAX_RESUME_BYTES));

        expect(response.status).toBe(201);
      });

      // the path is generated in the service, so nothing the client sent reaches it
      it("stores the file under a generated path, not the uploaded filename", async () => {
        const response = await upload(
          testName("Named"),
          randomBytes(512),
          "my-personal-resume.pdf",
        );

        const stored = await prisma.resume.findUniqueOrThrow({
          where: { id: response.body.id },
        });

        expect(stored.filePath.startsWith(`${userId}/`)).toBe(true);
        expect(stored.filePath.endsWith(".pdf")).toBe(true);
        expect(stored.filePath).not.toContain("my-personal-resume");
      });

      it("gives two uploads of the same filename different paths", async () => {
        const first = await upload(testName("Same One"), randomBytes(512), "resume.pdf");
        const second = await upload(testName("Same Two"), randomBytes(512), "resume.pdf");

        const one = await prisma.resume.findUniqueOrThrow({ where: { id: first.body.id } });
        const two = await prisma.resume.findUniqueOrThrow({ where: { id: second.body.id } });

        expect(one.filePath).not.toBe(two.filePath);
      });

      // the row is only half the job, the bytes have to be in the bucket too
      it("puts the uploaded bytes in the bucket", async () => {
        const bytes = randomBytes(1024);

        const response = await upload(testName("Stored"), bytes);

        const stored = await prisma.resume.findUniqueOrThrow({
          where: { id: response.body.id },
        });

        const file = await supabaseAdmin.storage
          .from(RESUME_BUCKET)
          .download(stored.filePath);

        expect(file.error).toBeNull();
        expect(file.data?.size).toBe(bytes.length);
      });

      // the upload happens before the insert, so a failed insert would leave the
      // bytes behind with no row naming them. spyOn replaces prisma.resume.create
      // for this test only, because a real insert failure cannot be arranged.
      it("removes the uploaded file when the database insert fails", async () => {
        const before = await supabaseAdmin.storage
          .from(RESUME_BUCKET)
          .list(userId, { limit: 1000 });

        const create = vi
          .spyOn(prisma.resume, "create")
          .mockRejectedValue(new Error("insert failed"));

        const response = await upload(testName("Rollback"), randomBytes(512));

        create.mockRestore();

        expect(response.status).toBe(500);

        const after = await supabaseAdmin.storage
          .from(RESUME_BUCKET)
          .list(userId, { limit: 1000 });

        expect(after.data?.length).toBe(before.data?.length);
      });

      // validation runs before the service, so nothing should reach storage
      it("uploads nothing when the label is invalid", async () => {
        const before = await supabaseAdmin.storage
          .from(RESUME_BUCKET)
          .list(userId, { limit: 1000 });

        const response = await upload("", randomBytes(512));

        expect(response.status).toBe(400);

        const after = await supabaseAdmin.storage
          .from(RESUME_BUCKET)
          .list(userId, { limit: 1000 });

        expect(after.data?.length).toBe(before.data?.length);
      });
    });

    describe("GET /resumes", () => {
      it("returns a list containing a created resume", async () => {
        const created = await upload(testName("Listed"), randomBytes(512));

        const response = await get("/resumes");

        expect(response.status).toBe(200);
        expect(response.body.map((resume: { id: string }) => resume.id)).toContain(created.body.id);
      });

      // the whole reason listResumes takes a userId
      it("does not return another user's resume", async () => {
        const theirs = await otherUsersResume("Not Mine");
        const mine = await upload(testName("Mine"), randomBytes(512));

        const response = await get("/resumes");

        const ids = response.body.map((resume: { id: string }) => resume.id);
        expect(ids).toContain(mine.body.id);
        expect(ids).not.toContain(theirs.id);
      });

      it("does not include the storage path in the list", async () => {
        await upload(testName("Listed Hidden"), randomBytes(512));

        const response = await get("/resumes").query({ label: testName("Listed Hidden") });

        expect(response.body[0].filePath).toBeUndefined();
      });

      it("returns at most limit resumes", async () => {
        await upload(testName("Limit One"), randomBytes(512));
        await upload(testName("Limit Two"), randomBytes(512));

        const response = await get("/resumes").query({ limit: 1 });

        expect(response.body.length).toBe(1);
      });

      it("returns an empty list for a page past the end", async () => {
        await upload(testName("Paged"), randomBytes(512));

        const response = await get("/resumes").query({ page: 999, limit: 1 });

        expect(response.body).toEqual([]);
      });

      it("filters by label", async () => {
        const wanted = await upload(testName("Wanted"), randomBytes(512));
        const other = await upload(testName("Other"), randomBytes(512));

        const response = await get("/resumes").query({ label: testName("Wanted") });

        const ids = response.body.map((resume: { id: string }) => resume.id);
        expect(ids).toContain(wanted.body.id);
        expect(ids).not.toContain(other.body.id);
      });

      // the filter is an exact match, not a search
      it("does not match a partial label", async () => {
        const created = await upload(testName("Backend SWE v3"), randomBytes(512));

        const response = await get("/resumes").query({ label: testName("Backend") });

        expect(response.body.map((resume: { id: string }) => resume.id)).not.toContain(created.body.id);
      });

      // createdAt is set by the database, so it is rewritten here to make the
      // expected order certain instead of depending on two writes landing apart
      it("sorts by newest first", async () => {
        const older = await upload(testName("Older"), randomBytes(512));
        const newer = await upload(testName("Newer"), randomBytes(512));

        await prisma.resume.update({
          where: { id: older.body.id },
          data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
        });

        await prisma.resume.update({
          where: { id: newer.body.id },
          data: { createdAt: new Date("2026-02-01T00:00:00.000Z") },
        });

        const response = await get("/resumes");

        const ids = response.body.map((resume: { id: string }) => resume.id);
        expect(ids.indexOf(newer.body.id)).toBeLessThan(ids.indexOf(older.body.id));
      });

      it("returns 400 when page is below 1", async () => {
        const response = await get("/resumes").query({ page: 0 });

        expect(response.status).toBe(400);
      });

      it("returns 400 when page is not a number", async () => {
        const response = await get("/resumes").query({ page: "abc" });

        expect(response.status).toBe(400);
      });

      it("returns 400 when limit is above the maximum", async () => {
        const response = await get("/resumes").query({ limit: 1000 });

        expect(response.status).toBe(400);
      });

      it("returns 400 when limit is below 1", async () => {
        const response = await get("/resumes").query({ limit: 0 });

        expect(response.status).toBe(400);
      });

      it("uses the defaults when no query is sent", async () => {
        const response = await get("/resumes");

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe("DELETE /resumes/:id", () => {
      it("removes the resume and returns 204", async () => {
        const created = await upload(testName("Removable"), randomBytes(512));

        const response = await del(`/resumes/${created.body.id}`);

        expect(response.status).toBe(204);

        const stored = await prisma.resume.findUnique({
          where: { id: created.body.id },
        });

        expect(stored).toBeNull();
      });

      // a gone row with a surviving file means the document was never destroyed
      it("removes the stored file as well as the row", async () => {
        const created = await upload(testName("Erased"), randomBytes(512));

        // read the path first, the row is the only record of where the bytes are
        const stored = await prisma.resume.findUniqueOrThrow({
          where: { id: created.body.id },
        });

        await del(`/resumes/${created.body.id}`);

        const file = await supabaseAdmin.storage
          .from(RESUME_BUCKET)
          .download(stored.filePath);

        expect(file.error).not.toBeNull();
      });

      it("returns 404 when the id is a valid uuid but no resume has it", async () => {
        const response = await del(`/resumes/${randomUUID()}`);

        expect(response.status).toBe(404);
      });

      it("returns 400 when the id is not a uuid", async () => {
        const response = await del("/resumes/not-a-uuid");

        expect(response.status).toBe(400);
      });

      it("returns 404 when the same resume is deleted twice", async () => {
        const created = await upload(testName("Twice"), randomBytes(512));

        await del(`/resumes/${created.body.id}`);
        const response = await del(`/resumes/${created.body.id}`);

        expect(response.status).toBe(404);
      });

      // deleteMany filters by userId, so a guessed id matches nothing
      it("returns 404 for another user's resume and leaves the row in place", async () => {
        const theirs = await otherUsersResume("Theirs");

        const response = await del(`/resumes/${theirs.id}`);

        expect(response.status).toBe(404);

        const stored = await prisma.resume.findUnique({ where: { id: theirs.id } });

        expect(stored).not.toBeNull();
      });

      // the 404 alone would not prove the storage half was skipped
      it("leaves another user's file in storage", async () => {
        const theirs = await otherUsersResume("Their File");

        await del(`/resumes/${theirs.id}`);

        const file = await supabaseAdmin.storage
          .from(RESUME_BUCKET)
          .download(theirs.filePath);

        expect(file.error).toBeNull();
      });

      // Application.resumeId is onDelete: SetNull, so the application survives
      it("clears the resume from an application that pointed at it", async () => {
        const created = await upload(testName("Linked"), randomBytes(512));

        const opportunity = await prisma.opportunity.create({
          data: {
            title: testName("Linked Posting"),
            type: "INTERNSHIP",
            sourceUrl: "https://example.com/jobs/1",
          },
        });

        const application = await prisma.application.create({
          data: { userId, opportunityId: opportunity.id, resumeId: created.body.id },
        });

        const response = await del(`/resumes/${created.body.id}`);

        expect(response.status).toBe(204);

        const stored = await prisma.application.findUniqueOrThrow({
          where: { id: application.id },
        });

        expect(stored.resumeId).toBeNull();
      });
    });
  })