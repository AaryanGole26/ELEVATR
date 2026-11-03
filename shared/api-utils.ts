import { NextResponse } from "next/server";

export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function apiResponse(success: boolean, data?: unknown, message?: string, status = 200) {
  return NextResponse.json(
    { success, message, data, timestamp: new Date().toISOString() },
    { status }
  );
}

const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

/**
 * Converts a thrown value into a response. Server-side failures are logged in full, but
 * only client errors (4xx) carry details back: database and provider messages stay private.
 */
export function apiError(error: unknown, defaultStatus = 500) {
  const statusCode = error instanceof APIError ? error.statusCode : defaultStatus;
  const isClientError = statusCode >= 400 && statusCode < 500;

  if (!isClientError) {
    console.error("[API Error]", error instanceof APIError ? { message: error.message, ...error.details } : error);
  }

  const message = error instanceof APIError && (isClientError || statusCode === 503) ? error.message : GENERIC_ERROR;

  return NextResponse.json(
    {
      success: false,
      message,
      details: isClientError && error instanceof APIError ? error.details : undefined,
      timestamp: new Date().toISOString()
    },
    { status: statusCode }
  );
}

/**
 * Identifies the caller for rate limiting. The right-most X-Forwarded-For entry is the one
 * added by our own proxy; earlier entries are supplied by the client and can be forged.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  const lastHop = forwarded?.split(",").pop()?.trim();
  return lastHop || "unknown";
}

const MAX_TRACKED_KEYS = 10_000;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function pruneRateLimitStore(now: number) {
  rateLimitStore.forEach((record, key) => {
    if (now > record.resetTime) rateLimitStore.delete(key);
  });
  // Still full after removing expired windows: drop the oldest entries (Map keeps insertion order).
  if (rateLimitStore.size >= MAX_TRACKED_KEYS) {
    const excess = rateLimitStore.size - MAX_TRACKED_KEYS + 1;
    Array.from(rateLimitStore.keys())
      .slice(0, excess)
      .forEach((key) => rateLimitStore.delete(key));
  }
}

/**
 * Fixed-window limiter. State is per server process, so with several instances the effective
 * limit is multiplied by the instance count. Use a shared store such as Redis when scaling out.
 */
export function rateLimit(key: string, maxRequests = 10, windowMs = 60_000): boolean {
  if (process.env.E2E_TEST_MODE === "true" && process.env.NODE_ENV !== "production") {
    return true;
  }

  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    if (rateLimitStore.size >= MAX_TRACKED_KEYS) pruneRateLimitStore(now);
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count < maxRequests) {
    record.count += 1;
    return true;
  }

  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseRequestBody(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new APIError(400, "Invalid JSON in request body");
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects malformed ids before they reach Postgres, where they would surface as a 500. */
export function assertUuid(value: string, label = "Resource"): void {
  if (!UUID_PATTERN.test(value)) {
    throw new APIError(404, `${label} not found.`);
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
