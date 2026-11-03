import { NextRequest } from "next/server";
import { getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, getClientIp } from "@/shared/api-utils";
import { looksLikePdf, MAX_RESUME_BYTES } from "@/shared/pdf";

export const runtime = "nodejs";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isDocx(buffer: Buffer) {
  // DOCX files are ZIP archives.
  return buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

/** POST /api/upload/resume: stores a resume for later parsing. The declared type is checked against the file's bytes. */
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`upload:${getClientIp(request)}`, 10, 60_000)) {
      throw new APIError(429, "Too many upload requests. Please try again later.");
    }

    const user = await getCurrentUser();
    if (!user) throw new APIError(401, "Authentication required. Please log in to upload a resume.");

    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new APIError(400, "No file provided. Please select a PDF or DOCX resume.");
    if (file.size > MAX_RESUME_BYTES) throw new APIError(413, "File is too large. The maximum size is 5MB.");
    if (file.type !== PDF_MIME && file.type !== DOCX_MIME) {
      throw new APIError(400, "Invalid file type. Please upload a PDF or DOCX file.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const valid = file.type === PDF_MIME ? looksLikePdf(buffer) : isDocx(buffer);
    if (!valid) throw new APIError(400, "This file's contents don't match its type.");

    const ext = file.type === PDF_MIME ? "pdf" : "docx";
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("resumes")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadErr) throw new APIError(500, "Failed to upload file to storage", { details: uploadErr.message });

    const { data: resume, error: dbErr } = await supabaseAdmin
      .from("resumes")
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        metadata: { uploaded_at: new Date().toISOString() }
      })
      .select("id, storage_path, file_name, created_at")
      .single();

    if (dbErr || !resume) {
      await supabaseAdmin.storage.from("resumes").remove([storagePath]).catch(() => undefined);
      throw new APIError(500, "Failed to save resume metadata", { details: dbErr?.message });
    }

    return apiResponse(
      true,
      { resume_id: resume.id, file_name: resume.file_name, storage_path: resume.storage_path, created_at: resume.created_at },
      "Resume uploaded successfully"
    );
  } catch (error) {
    return apiError(error);
  }
}
