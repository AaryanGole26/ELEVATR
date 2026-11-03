import crypto from "crypto";
import { env } from "@/shared/env";

/** Server-only helpers. Token checks must never run in the browser, where they can be bypassed. */

export const INTERVIEW_LINK_TTL_HOURS = 72;

export function generateInterviewToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateInterviewExpiry(hoursFromNow = INTERVIEW_LINK_TTL_HOURS): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function safeEqual(a: string, b: string): boolean {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

export function tokensMatch(provided: string | null | undefined, stored: string | null | undefined): boolean {
  if (!provided || !stored) return false;
  return safeEqual(provided, stored);
}

export function isExpired(expiresAt: string | null | undefined): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
}

/** True only when the request carries the secret shared with the interview service. */
export function hasValidServiceSecret(request: Request): boolean {
  const provided = request.headers.get("x-elevatr-service-secret");
  if (!env.interviewServiceSecret || !provided) return false;
  return safeEqual(provided, env.interviewServiceSecret);
}
