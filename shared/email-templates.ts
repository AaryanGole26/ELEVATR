import { escapeHtml } from "@/shared/api-utils";

/** Every candidate email goes through this layout, so user content is always escaped. */
function layout(params: { heading: string; paragraphs: string[]; cta?: { label: string; href: string }; footnote?: string }) {
  const body = params.paragraphs.map((text) => `<p style="margin:0 0 14px;line-height:1.6;color:#334155">${text}</p>`).join("");
  const cta = params.cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(params.cta.href)}" style="display:inline-block;padding:12px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600">${escapeHtml(params.cta.label)}</a></p>`
    : "";
  const footnote = params.footnote
    ? `<p style="margin:18px 0 0;font-size:13px;color:#64748b;line-height:1.5">${params.footnote}</p>`
    : "";
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
  <p style="margin:0 0 18px;font-weight:700;letter-spacing:.08em;color:#2563eb;font-size:13px">ELEVATR</p>
  <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px">${escapeHtml(params.heading)}</h2>
  ${body}${cta}${footnote}
</div>`;
}

export function interviewInviteEmail(params: {
  pipelineTitle: string;
  questions: number;
  minutes: number;
  link: string;
  expiresInHours: number;
  setPasswordLink?: string | null;
}) {
  const title = escapeHtml(params.pipelineTitle);
  const account = params.setPasswordLink
    ? `A candidate account was created for you, so you can follow your application. <a href="${escapeHtml(params.setPasswordLink)}">Set your password</a> to sign in.`
    : undefined;
  return {
    subject: `You're shortlisted for ${params.pipelineTitle}`,
    html: layout({
      heading: "You've been shortlisted",
      paragraphs: [
        `Your application for <strong>${title}</strong> has been shortlisted. The next step is an AI video interview of about <strong>${params.minutes} minutes</strong> and up to <strong>${params.questions} questions</strong>.`,
        `This link is personal to you, works for one interview, and expires in ${params.expiresInHours} hours.`
      ],
      cta: { label: "Start video interview", href: params.link },
      footnote: account
    })
  };
}

export function screeningRejectionEmail(pipelineTitle: string) {
  return {
    subject: `Update on your application for ${pipelineTitle}`,
    html: layout({
      heading: "Thank you for applying",
      paragraphs: [
        `We appreciate the time you put into your application for <strong>${escapeHtml(pipelineTitle)}</strong>.`,
        "After reviewing your profile against the current requirements, we won't be moving forward with your application at this time. We wish you the best in your search."
      ]
    })
  };
}

export function statusUpdateEmail(pipelineTitle: string, status: string) {
  return {
    subject: `Application update for ${pipelineTitle}`,
    html: layout({
      heading: "Your application update",
      paragraphs: [
        `Thank you for applying to <strong>${escapeHtml(pipelineTitle)}</strong>.`,
        `Your application status is currently <strong>${escapeHtml(status)}</strong>. We'll keep you informed as things progress.`
      ]
    })
  };
}

export function finalDecisionEmail(pipelineTitle: string, decision: "selected" | "rejected") {
  if (decision === "selected") {
    return {
      subject: `Congratulations: you've passed all rounds for ${pipelineTitle}`,
      html: layout({
        heading: "Congratulations!",
        paragraphs: [
          `You have passed all ELEVATR rounds for <strong>${escapeHtml(pipelineTitle)}</strong>.`,
          "The hiring team will contact you soon with the next steps."
        ]
      })
    };
  }
  return {
    subject: `Update on your application for ${pipelineTitle}`,
    html: layout({
      heading: "Thank you for interviewing",
      paragraphs: [
        `Thank you for taking the time to interview for <strong>${escapeHtml(pipelineTitle)}</strong>.`,
        "Unfortunately, we won't be moving forward with your application at this time. We wish you the best in your search."
      ]
    })
  };
}
