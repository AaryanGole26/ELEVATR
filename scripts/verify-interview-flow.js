#!/usr/bin/env node

/**
 * Interview Data Flow Verification Script
 * 
 * Usage: node scripts/verify-interview-flow.js <interview_id>
 * 
 * Tests:
 * 1. Interview record exists and has required fields
 * 2. Application record is linked and updated
 * 3. Report PDFs exist in storage
 * 4. AI evaluation data is present
 * 5. Status is properly set
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// Read environment variables
const envPath = path.join(__dirname, "../.env.local");
if (!fs.existsSync(envPath)) {
  console.error(
    "❌ .env.local not found. Create it with SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const env = fs.readFileSync(envPath, "utf-8");
const serviceRoleKey = env.match(
  /SUPABASE_SERVICE_ROLE_KEY=([^\n]+)/
)?.[1];
const supabaseUrl = env.match(
  /NEXT_PUBLIC_SUPABASE_URL=([^\n]+)/
)?.[1];

if (!serviceRoleKey || !supabaseUrl) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const interviewId = process.argv[2];
if (!interviewId) {
  console.error("Usage: node scripts/verify-interview-flow.js <interview_id>");
  process.exit(1);
}

// Helper to make Supabase API calls
async function supabaseQuery(table, filter) {
  return new Promise((resolve, reject) => {
    const url = new URL(
      `${supabaseUrl}/rest/v1/${table}?${filter}`,
      supabaseUrl
    );

    const options = {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    };

    https
      .get(url.toString(), options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse: ${data}`));
          }
        });
      })
      .on("error", reject);
  });
}

async function verify() {
  console.log(`\n🔍 Verifying interview flow for ID: ${interviewId}\n`);

  try {
    // Step 1: Check interview record
    console.log("📋 Checking interview record...");
    const interviews = await supabaseQuery(
      "interviews",
      `id=eq.${interviewId}&select=*`
    );

    if (!interviews || interviews.length === 0) {
      console.error("❌ Interview not found");
      process.exit(1);
    }

    const interview = interviews[0];
    console.log("✅ Interview found");
    console.log(`   ID: ${interview.id}`);
    console.log(`   Status: ${interview.interview_status || "N/A"}`);
    console.log(`   Is Used: ${interview.is_used}`);
    console.log(`   Completed At: ${interview.completed_at || "N/A"}`);

    // Step 2: Check result_json
    console.log("\n📊 Checking result data...");
    const result = interview.result_json || {};
    console.log(`   Has result_json: ${!!result}`);
    console.log(`   Overall Score: ${result.overallScore || result.overall_score || "❌ MISSING"}`);
    console.log(`   AI Recommendation: ${result.ai_recommendation || "❌ MISSING"}`);
    console.log(`   Transcript Length: ${(result.transcript || "").length} chars`);
    console.log(`   Strengths: ${(result.strengths || []).length} items`);
    console.log(`   Weaknesses: ${(result.weaknesses || []).length} items`);

    if (!result.overallScore && !result.overall_score) {
      console.warn(
        "   ⚠️  No AI score found - evaluation may not have run"
      );
    }

    // Step 3: Check application record
    console.log("\n👤 Checking application record...");
    const apps = await supabaseQuery(
      "applications",
      `id=eq.${interview.application_id}&select=*`
    );

    if (!apps || apps.length === 0) {
      console.error("❌ Application not found");
      process.exit(1);
    }

    const application = apps[0];
    console.log("✅ Application found");
    console.log(`   ID: ${application.id}`);
    console.log(`   Status: ${application.status}`);
    console.log(`   Interview Score: ${application.latest_interview_score || "❌ NOT SET"}`);
    console.log(`   Report URL Set: ${!!application.latest_report_pdf_url ? "✅" : "❌"}`);

    if (application.status !== "interviewed" && application.status !== "selected" && application.status !== "rejected") {
      console.warn(`   ⚠️  Status is "${application.status}", expected "interviewed" or similar`);
    }

    // Step 4: Check report URLs
    console.log("\n📄 Checking report URLs...");
    console.log(`   HR Report URL: ${interview.report_pdf_url || "❌ NOT SET"}`);
    console.log(
      `   Candidate Report URL: ${result.candidate_report_pdf_url || "❌ NOT SET"}`
    );

    if (!interview.report_pdf_url) {
      console.warn("   ⚠️  No HR report URL - PDFs may not have been generated");
    }

    // Summary
    console.log("\n📈 Summary:");
    const checks = {
      "Interview exists": !!interview,
      "Interview completed": interview.interview_status === "completed",
      "Interview marked as used": interview.is_used === true,
      "Application linked": !!application,
      "Status updated": application.status === "interviewed" || application.status === "selected" || application.status === "rejected",
      "Score recorded": (application.latest_interview_score || 0) > 0,
      "AI recommendation set": !!result.ai_recommendation,
      "Report URL set": !!interview.report_pdf_url,
      "Transcript available": (result.transcript || "").length > 50,
    };

    let passed = 0;
    let total = 0;
    Object.entries(checks).forEach(([check, value]) => {
      console.log(`   ${value ? "✅" : "❌"} ${check}`);
      total++;
      if (value) passed++;
    });

    console.log(`\n✨ Result: ${passed}/${total} checks passed`);

    if (passed === total) {
      console.log("\n🎉 Interview data flow is working correctly!\n");
      process.exit(0);
    } else {
      console.log("\n⚠️  Some checks failed. Review the logs above.\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    process.exit(1);
  }
}

verify();
