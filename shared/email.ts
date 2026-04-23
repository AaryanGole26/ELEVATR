import nodemailer from "nodemailer";
import { env } from "@/shared/env";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.gmailUser || "elevatr-hr@gmail.com",
    pass: env.gmailAppPassword
  }
});

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  if (!env.gmailAppPassword) {
    return { skipped: true, reason: "GMAIL_APP_PASSWORD is missing" };
  }

  try {
    const response = await transporter.sendMail({
      from: `ELEVATR HR <${env.gmailUser || "elevatr-hr@gmail.com"}>`,
      to: params.to,
      subject: params.subject,
      html: params.html
    });

    return { skipped: false, messageId: response.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email transport error";
    if (/535|badcredentials|username and password not accepted/i.test(message)) {
      throw new Error("Email authentication failed. Set a valid Gmail app password in GMAIL_APP_PASSWORD.");
    }
    throw new Error(`Email send failed: ${message}`);
  }
}