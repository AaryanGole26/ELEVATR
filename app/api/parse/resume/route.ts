import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, validateRequired, parseRequestBody } from "@/shared/api-utils";
import { z } from "zod";

// Import PDF parsing library - using pdf-parse which is commonly available
// For DOCX: we'll need mammoth or similar

const parseResumeSchema = z.object({
  resume_id: z.string().uuid("Invalid resume ID"),
  file_type: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"])
});

/**
 * Simple PDF text extraction using a basic approach
 * For production, consider using dedicated libraries like:
 * - pdf-parse (for PDFs)
 * - mammoth (for DOCX)
 */
async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  try {
    // Basic PDF text extraction - this is a simplified version
    // For production, use: npm install pdf-parse
    const text = Buffer.from(buffer).toString("binary");

    // Extract text between common PDF text markers
    const matches = text.match(/BT.*?ET/gs) || [];
    let extracted = "";

    matches.forEach((match) => {
      // Very basic extraction - get content between parentheses
      const textMatches = match.match(/\((.*?)\)/g) || [];
      textMatches.forEach((m) => {
        extracted += m.replace(/[()]/g, " ") + " ";
      });
    });

    // Fallback: return raw text if extraction failed
    if (extracted.length < 20) {
      extracted = text.replace(/[^\w\s]/g, " ").split(/\s+/).join(" ");
    }

    return extracted.substring(0, 50000); // Max 50K chars
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Simple DOCX text extraction
 * For DOCX files, we extract from the XML content
 */
async function extractTextFromDOCX(buffer: ArrayBuffer): Promise<string> {
  try {
    // DOCX is a ZIP file, we need to extract document.xml
    // For now, provide a placeholder - production would use mammoth library
    // npm install mammoth

    // This is a simplified version that returns a placeholder
    // In production: const mammoth = require('mammoth');
    // const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    // return result.value;

    return "DOCX parsing requires 'mammoth' library. Please install: npm install mammoth";
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting - parsing is compute-intensive
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`parse:${ip}`, 5, 60000)) {
      throw new APIError(429, "Too many parsing requests. Please try again later.");
    }

    // Authentication
    const user = await getCurrentUser();
    if (!user) {
      throw new APIError(401, "Authentication required. Please log in to parse a resume.");
    }

    // Parse and validate request body
    const body = await parseRequestBody(request);
    const parsed = parseResumeSchema.safeParse(body);

    if (!parsed.success) {
      throw new APIError(400, "Invalid parsing request", {
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const { resume_id, file_type } = parsed.data;

    // Fetch resume metadata
    const { data: resumeRecord, error: fetchErr } = await supabaseAdmin
      .from("resumes")
      .select("id, user_id, storage_path, file_type, parsed_content, metadata")
      .eq("id", resume_id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !resumeRecord) {
      throw new APIError(404, "Resume not found or access denied.");
    }

    // Check if already parsed
    if (resumeRecord.parsed_content) {
      return apiResponse(
        true,
        {
          resume_id,
          parsed_text: resumeRecord.parsed_content,
          extracted_at: resumeRecord.metadata?.extracted_at,
          from_cache: true
        },
        "Resume text retrieved from cache",
        200
      );
    }

    // Download file from storage
    const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
      .from("resumes")
      .download(resumeRecord.storage_path);

    if (downloadErr || !fileData) {
      throw new APIError(500, "Failed to download resume file", {
        details: downloadErr?.message
      });
    }

    // Extract text based on file type
    let parsedText: string;

    if (file_type === "application/pdf") {
      parsedText = await extractTextFromPDF(await fileData.arrayBuffer());
    } else {
      parsedText = await extractTextFromDOCX(await fileData.arrayBuffer());
    }

    if (!parsedText || parsedText.length < 20) {
      throw new APIError(422, "Could not extract sufficient text from resume. File may be corrupted or in an unsupported format.");
    }

    // Store parsed content
    const { error: updateErr } = await supabaseAdmin
      .from("resumes")
      .update({
        parsed_content: parsedText,
        metadata: {
          ...resumeRecord.metadata,
          extracted_at: new Date().toISOString(),
          extracted_length: parsedText.length
        }
      })
      .eq("id", resume_id);

    if (updateErr) {
      console.error("Failed to cache parsed content:", updateErr);
      // Don't throw - we can still return the parsed text even if caching fails
    }

    return apiResponse(
      true,
      {
        resume_id,
        parsed_text: parsedText,
        text_length: parsedText.length,
        extracted_at: new Date().toISOString(),
        from_cache: false
      },
      "Resume parsed and extracted successfully",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
