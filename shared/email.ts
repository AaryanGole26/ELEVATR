import nodemailer from "nodemailer";
import { env } from "@/shared/env";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  transporter ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.gmailUser, pass: env.gmailAppPassword }
  });
  return transporter;
}

export function isEmailConfigured() {
  return !!env.gmailUser && !!env.gmailAppPassword;
}

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  if (!isEmailConfigured()) {
    return { skipped: true as const, reason: "GMAIL_USER / GMAIL_APP_PASSWORD are not configured" };
  }

  try {
    const response = await getTransporter().sendMail({
      from: `ELEVATR Hiring <${env.gmailUser}>`,
      to: params.to,
      subject: params.subject.replace(/[\r\n]+/g, " "),
      html: params.html
    });
    return { skipped: false as const, messageId: response.messageId as string };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email transport error";
    if (/535|badcredentials|username and password not accepted/i.test(message)) {
      throw new Error("Email authentication failed. Check GMAIL_APP_PASSWORD.");
    }
    throw new Error(`Email send failed: ${message}`);
  }
}
