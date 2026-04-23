import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, validateRequired } from "@/shared/api-utils";
import { createClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`upload:${ip}`, 10, 60000)) {
      throw new APIError(429, "Too many upload requests. Please try again later.");
    }

    // Authentication
    const user = await getCurrentUser();
    if (!user) {
      throw new APIError(401, "Authentication required. Please log in to upload a resume.");
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      throw new APIError(400, "No file provided. Please select a resume file (PDF or DOCX).");
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new APIError(400, `Invalid file type. Please upload a PDF or DOCX file. Received: ${file.type}`);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new APIError(413, `File is too large. Maximum size is 5MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = file.type === "application/pdf" ? "pdf" : "docx";
    const fileName = `${user.id}/${timestamp}_resume.${ext}`;

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    
    // Ensure resumes bucket exists
    const { data: bucketCheck } = await supabaseAdmin.storage.getBucket("resumes");
    if (!bucketCheck) {
      console.log("Bucket 'resumes' not detected at runtime, attempting auto-creation...");
      await supabaseAdmin.storage.createBucket("resumes", { public: false });
    }

    const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
      .from("resumes")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
        metadata: {
          userId: user.id,
          uploadedAt: new Date().toISOString(),
          originalName: file.name
        }
      });

    if (uploadErr || !uploadData) {
      throw new APIError(500, "Failed to upload file to storage", {
        details: uploadErr?.message
      });
    }

    // Store metadata in database
    const { data: resumeRecord, error: dbErr } = await supabaseAdmin
      .from("resumes")
      .insert({
        user_id: user.id,
        storage_path: uploadData.path,
        // Move potentially missing columns to metadata
        metadata: {
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          uploadedAt: new Date().toISOString(),
          storagePath: uploadData.path
        }
      })
      .select("id, storage_path, metadata, created_at")
      .single();

    if (dbErr || !resumeRecord) {
      // Try to clean up uploaded file
      await supabaseAdmin.storage.from("resumes").remove([uploadData.path]).catch(() => {});
      throw new APIError(500, "Failed to save resume metadata", {
        details: dbErr?.message
      });
    }

    const meta = (resumeRecord.metadata || {}) as Record<string, any>;

    return apiResponse(
      true,
      {
        resume_id: resumeRecord.id,
        file_name: meta.file_name || "resume",
        storage_path: resumeRecord.storage_path,
        created_at: resumeRecord.created_at
      },
      "Resume uploaded successfully",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
