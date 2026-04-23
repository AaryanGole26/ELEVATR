import { NextResponse } from 'next/server';

export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
  }
}

/**
 * Structured API response
 */
export function apiResponse(
  success: boolean,
  data?: any,
  message?: string,
  status: number = 200
) {
  return NextResponse.json(
    {
      success,
      message,
      data,
      timestamp: new Date().toISOString()
    },
    { status }
  );
}

/**
 * Error response handler
 */
export function apiError(error: unknown, defaultStatus: number = 500) {
  console.error('[API Error]', error);

  if (error instanceof APIError) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString()
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      },
      { status: defaultStatus }
    );
  }

  return NextResponse.json(
    {
      success: false,
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    },
    { status: defaultStatus }
  );
}

/**
 * Rate limiter (in-memory, simple)
 * For production, use Redis or external service
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(key: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count < maxRequests) {
    record.count++;
    return true;
  }

  return false;
}

/**
 * Get rate limit info
 */
export function getRateLimitInfo(key: string): { remaining: number; resetTime: number } | null {
  const record = rateLimitStore.get(key);
  if (!record) return null;

  return {
    remaining: Math.max(0, 10 - record.count),
    resetTime: record.resetTime
  };
}

/**
 * Safe JSON parsing
 */
export async function parseRequestBody(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch (error) {
    throw new APIError(400, 'Invalid JSON in request body');
  }
}

/**
 * Validate required fields
 */
export function validateRequired(data: any, fields: string[]): void {
  const missing = fields.filter((f) => !data[f]);
  if (missing.length > 0) {
    throw new APIError(400, 'Missing required fields', { missing });
  }
}
