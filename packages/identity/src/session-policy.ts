import type { SessionPolicy, SessionRecord } from "./contracts.js";

/**
 * Approved MVP session policy:
 * - 30 minutes of inactivity
 * - 12 hours absolute lifetime, enforced independently by the resolver
 *
 * Do not silently change these values; policy changes require a documented
 * security decision and review of session issuance and renewal behavior.
 */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1000;

export const mvpSessionPolicy: SessionPolicy = {
  isExpired(session: SessionRecord, now: Date): boolean {
    const lastSeen = Date.parse(session.lastSeenAt);
    if (!Number.isFinite(lastSeen)) return true;
    const currentTime = now.getTime();
    if (lastSeen > currentTime + 60_000) return true;
    return currentTime - lastSeen >= SESSION_IDLE_TIMEOUT_MS;
  }
};
