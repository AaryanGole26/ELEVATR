import crypto from 'crypto';

/**
 * Generate secure interview token
 */
export function generateInterviewToken(interviewId: string): string {
  const data = `${interviewId}:${Date.now()}:${Math.random()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate interview token and expiry
 */
export function validateInterviewToken(
  token: string,
  storedToken: string,
  expiresAt: Date,
  isUsed: boolean
): {
  valid: boolean;
  reason?: string;
} {
  // Check if already used
  if (isUsed) {
    return { valid: false, reason: 'Interview link has already been used' };
  }

  // Check if expired
  if (new Date() > expiresAt) {
    return { valid: false, reason: 'Interview link has expired' };
  }

  // Check token match
  if (token !== storedToken) {
    return { valid: false, reason: 'Invalid interview link' };
  }

  return { valid: true };
}

/**
 * Generate interview expiry time
 * Default: 72 hours from now
 */
export function generateInterviewExpiry(hoursFromNow: number = 72): Date {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hoursFromNow);
  return expiresAt;
}
