import crypto from 'node:crypto';
import { env } from '../../config/env.js';

class SessionManager {
  private activeTokens: Set<string> = new Set();

  isAuthRequired(): boolean {
    return Boolean(env.dashboardPassword && env.dashboardPassword.trim().length > 0);
  }

  verifyPassword(input: string): boolean {
    if (!this.isAuthRequired()) {
      return true;
    }
    const expected = env.dashboardPassword.trim();
    if (input.length !== expected.length) {
      return false;
    }
    try {
      return crypto.timingSafeEqual(Buffer.from(input), Buffer.from(expected));
    } catch {
      return input === expected;
    }
  }

  createSessionToken(): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.activeTokens.add(token);
    return token;
  }

  isValidToken(token: string | null | undefined): boolean {
    if (!this.isAuthRequired()) {
      return true; // No password configured; open access in dev
    }
    if (!token) return false;
    return this.activeTokens.has(token.trim());
  }

  revokeToken(token: string): void {
    if (token) {
      this.activeTokens.delete(token.trim());
    }
  }
}

export const sessionManager = new SessionManager();
