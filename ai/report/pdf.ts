import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { InterviewEvaluation, InterviewKpi } from "@/shared/types";

export async function createInterviewReportPdf(input: {
  applicationId: string;
  pipelineTitle: string;
  candidateEmail?: string;
  resultJson: any;
  audience?: "hr" | "candidate";
}) {
  const audience = input.audience || "hr";
  const evaluation = input.resultJson as Partial<InterviewEvaluation>;
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 800;

  const ensureSpace = (needed: number, title?: string) => {
    if (y >= needed) return;
    page = pdf.addPage([595, 842]);
    y = 800;
    if (title) {
      page.drawText(title, { x: 40, y, size: 10, font: bold });
      y -= 20;
    }
  };

  const drawWrappedText = (text: string, x: number, size: number, maxWidth: number, lineHeight: number, useBold = false, color = rgb(0, 0, 0)) => {
    const drawFont = useBold ? bold : font;
    const words = (text || "").split(/\s+/).filter(Boolean);
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (drawFont.widthOfTextAtSize(testLine, size) <= maxWidth) {
        line = testLine;
        continue;
      }

      if (line) {
        ensureSpace(60);
        page.drawText(line, { x, y, size, font: drawFont, color });
        y -= lineHeight;
      }
      line = word;
    }

    if (line) {
      ensureSpace(60);
      page.drawText(line, { x, y, size, font: drawFont, color });
      y -= lineHeight;
    }
  };

  const drawBullets = (items: string[], x: number, maxWidth: number, lineHeight: number) => {
    for (const item of items) {
      const bulletText = `• ${item}`;
      drawWrappedText(bulletText, x, 9, maxWidth, lineHeight);
    }
  };

  // Header
  page.drawRectangle({
    x: 0,
    y: 770,
    width: 595,
    height: 72,
    color: rgb(0.04, 0.43, 1) // Elevatr Blue
  });

  page.drawText("ELEVATR Interview Report", {
    x: 40,
    y: 800,
    size: 24,
    font: bold,
    color: rgb(1, 1, 1)
  });

  y = 740;

  // Candidate Info Section
  page.drawText(audience === "hr" ? "Candidate Information" : "Interview Summary", { x: 40, y, size: 14, font: bold });
  y -= 25;
  const info = [
    `Email: ${input.candidateEmail || "Guest User"}`,
    `Pipeline: ${input.pipelineTitle}`,
    `Application ID: ${input.applicationId.slice(0, 8)}...`,
    `Interview Date: ${new Date().toLocaleDateString()}`
  ];

  for (const line of info) {
    page.drawText(line, { x: 40, y, size: 10, font });
    y -= 15;
  }

  y -= 15;

  if (audience === "candidate") {
    page.drawText("Candidate View", { x: 40, y, size: 12, font: bold });
    y -= 15;
    drawWrappedText(
      "This version is intentionally redacted. It keeps your high-level outcome and feedback while omitting the full transcript, detailed scoring breakdown, and internal evaluation notes.",
      40,
      9,
      515,
      12,
      false,
      rgb(0.35, 0.35, 0.35)
    );
    y -= 10;
  }

  // Overall Score Section
  if (evaluation.overallScore !== undefined) {
    page.drawText("Overall Evaluation Score", { x: 40, y, size: 14, font: bold });
    y -= 30;
    
    // Draw score bar background
    page.drawRectangle({ x: 40, y, width: 200, height: 20, color: rgb(0.9, 0.9, 0.9) });
    
    // Draw score bar
    const scoreVal = Math.max(0, Math.min(100, evaluation.overallScore));
    const scoreColor = scoreVal >= 70 ? rgb(0.1, 0.7, 0.3) : rgb(0.9, 0.4, 0.1);
    page.drawRectangle({ x: 40, y, width: (scoreVal / 100) * 200, height: 20, color: scoreColor });
    
    page.drawText(`${scoreVal}/100`, { x: 250, y: y + 5, size: 12, font: bold });
    y -= 40;
  }

  if (audience === "hr" && evaluation.kpis) {
    page.drawText("KPI Breakdown", { x: 40, y, size: 14, font: bold });
    y -= 25;

    const kpiLabels: Record<string, string> = {
      confidence: "Confidence",
      clarity: "Clarity of Thought",
      technical: "Technical Proficiency",
      communication: "Communication Skills",
      culture_fit: "Culture Fit"
    };

    for (const [key, data] of Object.entries(evaluation.kpis)) {
      ensureSpace(80, "KPI Breakdown (continued)");
      const label = kpiLabels[key] || key;
      page.drawText(label, { x: 40, y, size: 10, font });

      page.drawRectangle({ x: 160, y: y - 2, width: 100, height: 10, color: rgb(0.9, 0.9, 0.9) });
      const kpiScore = Math.max(0, Math.min(100, (data as any).score || 0));
      page.drawRectangle({ x: 160, y: y - 2, width: (kpiScore / 100) * 100, height: 10, color: rgb(0.04, 0.43, 1) });

      page.drawText(`${kpiScore}%`, { x: 270, y, size: 9, font });

      const feedback = (data as any).feedback || "";
      page.drawText(feedback.slice(0, 80) + (feedback.length > 80 ? "..." : ""), {
        x: 310,
        y,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4)
      });

      y -= 20;
    }
  }

  y -= 20;

  // Strengths & Weaknesses
  if (evaluation.strengths || evaluation.weaknesses) {
    const startY = y;
    if (evaluation.strengths) {
      page.drawText("Key Strengths", { x: 40, y, size: 12, font: bold });
      y -= 15;
      evaluation.strengths.slice(0, 4).forEach(s => {
        page.drawText(`• ${s}`, { x: 45, y, size: 9, font });
        y -= 12;
      });
    }
    
    // Check if we need to reset Y for weaknesses if they're side-by-side
    const strengthsEndY = y;
    y = startY;
    if (evaluation.weaknesses) {
      page.drawText("Areas for Improvement", { x: 300, y, size: 12, font: bold });
      y -= 15;
      evaluation.weaknesses.slice(0, 4).forEach(w => {
        page.drawText(`• ${w}`, { x: 305, y, size: 9, font });
        y -= 12;
      });
    }
    y = Math.min(strengthsEndY, y) - 20;
  }

  // Summary
  if (evaluation.summary) {
    ensureSpace(100, "Executive Summary");
    page.drawText("Executive Summary", { x: 40, y, size: 12, font: bold });
    y -= 15;
    drawWrappedText(evaluation.summary, 40, 9, 515, 12);
    y -= 20;
  }

  if (audience === "candidate") {
    ensureSpace(100, "What to Expect Next");
    page.drawText("What to Expect Next", { x: 40, y, size: 12, font: bold });
    y -= 15;
    drawWrappedText(
      "Your hiring team can review the full transcript and scoring details. This summary is the candidate-safe version intended for your records and feedback.",
      40,
      9,
      515,
      12,
      false,
      rgb(0.35, 0.35, 0.35)
    );
  } else if (evaluation.transcript && Array.isArray(evaluation.transcript)) {
    ensureSpace(100, "Interview Transcript Snippet");
    page.drawText("Interview Transcript Snippet", { x: 40, y, size: 12, font: bold });
    y -= 20;

    for (const turn of evaluation.transcript.slice(0, 15)) {
      ensureSpace(90, "Transcript (continued)");

      const roleLabel = turn.role === "interviewer" ? "AI:" : "Candidate:";
      page.drawText(roleLabel, { x: 40, y, size: 9, font: bold });

      drawWrappedText(turn.text || "", 100, 9, 430, 11);
      y -= 5;
    }
  }

  return Buffer.from(await pdf.save());
}