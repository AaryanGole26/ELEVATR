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

  const cleanText = (text: string) => {
    if (!text) return "";
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  };

  const drawWrappedText = (rawText: string, x: number, size: number, maxWidth: number, lineHeight: number, useBold = false, color = rgb(0, 0, 0)) => {
    const drawFont = useBold ? bold : font;
    const text = cleanText(rawText);
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
    page.drawText("Your Interview Report", { x: 40, y, size: 12, font: bold });
    y -= 15;
    drawWrappedText(
      "Below is your complete interview evaluation including your score, feedback, strengths, areas for improvement, and the full transcript of your conversation. Use this for your personal records and future reference.",
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

  // KPI Breakdown - show to all audiences
  if (evaluation.kpis) {
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

      const feedback = cleanText((data as any).feedback || "");
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
        page.drawText(`• ${cleanText(s)}`, { x: 45, y, size: 9, font });
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
        page.drawText(`• ${cleanText(w)}`, { x: 305, y, size: 9, font });
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

  // Full Interview Transcript - show to all audiences
  if (evaluation.transcript) {
    ensureSpace(100, "Full Interview Transcript");
    page.drawText("Full Interview Transcript", { x: 40, y, size: 12, font: bold });
    y -= 20;

    if (Array.isArray(evaluation.transcript)) {
      for (const turn of evaluation.transcript) {
        ensureSpace(90, "Transcript (continued)");

        const roleLabel = turn.role === "interviewer" ? "AI:" : "Candidate:";
        page.drawText(roleLabel, { x: 40, y, size: 9, font: bold });

        drawWrappedText(turn.text || "", 100, 9, 430, 11);
        y -= 5;
      }
    } else if (typeof evaluation.transcript === 'string') {
      const lines = evaluation.transcript.split('\n');
      for (const line of lines) {
        ensureSpace(90, "Transcript (continued)");
        drawWrappedText(line, 40, 9, 490, 11);
        y -= 5;
      }
    }
  }

  return Buffer.from(await pdf.save());
}