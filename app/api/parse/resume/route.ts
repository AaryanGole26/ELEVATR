import { NextRequest } from "next/server";
import { z } from "zod";
import mammoth from "mammoth";
import { getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody, getClientIp } from "@/shared/api-utils";
import { extractPdfText } from "@/shared/pdf";

export const runtime = "nodejs";

const MAX_TEXT_CHARS = 50_000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const parseResumeSchema = z.object({ resume_id: z.string().uuid("Invalid resume ID") });

/** POST /api/parse/resume: extracts and caches the text of a resume uploaded by the signed-in user. */
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`parse:${getClientIp(request)}`, 5, 60_000)) {
      throw new APIError(429, "Too many parsing requests. Please try again later.");
    }

    const user = await getCurrentUser();
    if (!user) throw new APIError(401, "Authentication required. Please log in to parse a resume.");

    const parsed = parseResumeSchema.safeParse(await parseRequestBody(request));
    if (!parsed.success) throw new APIError(400, "Invalid parsing request", { errors: parsed.error.flatten().fieldErrors });
    const { resume_id } = parsed.data;

    const { data: resume, error: fetchErr } = await supabaseAdmin
      .from("resumes")
      .select("id, storage_path, file_type, parsed_content, metadata")
      .eq("id", resume_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr) throw new APIError(500, "Failed to load resume", { details: fetchErr.message });
    if (!resume) throw new APIError(404, "Resume not found.");

    if (resume.parsed_content) {
      return apiResponse(true, { resume_id, parsed_text: resume.parsed_content, from_cache: true }, "Resume text retrieved from cache");
    }
    if (!resume.storage_path) throw new APIError(409, "This resume has no uploaded file to parse.");

    const { data: fileData, error: downloadErr } = await supabaseAdmin.storage.from("resumes").download(resume.storage_path);
    if (downloadErr || !fileData) throw new APIError(500, "Failed to download resume file", { details: downloadErr?.message });

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let text: string;
    try {
      text = resume.file_type === DOCX_MIME
        ? (await mammoth.extractRawText({ buffer })).value.trim()
        : await extractPdfText(buffer);
    } catch (parseError) {
      console.error("Resume parsing failed:", parseError);
      throw new APIError(422, "We couldn't read this file. It may be corrupted or in an unsupported format.");
    }

    if (text.length < 20) {
      throw new APIError(422, "We couldn't find enough text in this file. Scanned documents aren't supported.");
    }
    text = text.slice(0, MAX_TEXT_CHARS);

    const { error: updateErr } = await supabaseAdmin
      .from("resumes")
      .update({
        content: text,
        parsed_content: text,
        metadata: { ...(resume.metadata as object), extracted_at: new Date().toISOString(), extracted_length: text.length }
      })
      .eq("id", resume_id);
    // The text is still useful to the caller if caching it fails.
    if (updateErr) console.error("Failed to cache parsed content:", updateErr.message);

    return apiResponse(true, { resume_id, parsed_text: text, text_length: text.length, from_cache: false }, "Resume parsed successfully");
  } catch (error) {
    return apiError(error);
  }
}
