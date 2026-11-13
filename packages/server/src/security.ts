import { AVATAR_IDS, REACTION_EMOJIS } from '@uno/shared';

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g;
const MULTI_SPACE_RE = /\s+/g;

export type SanitizeResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Validates and cleans a player display name (1-20 characters). */
export function sanitizeDisplayName(raw: unknown): SanitizeResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Display name is required.' };
  }
  const cleaned = raw.replace(CONTROL_CHARS_RE, '').replace(MULTI_SPACE_RE, ' ').trim();
  if (cleaned.length === 0) {
    return { ok: false, error: 'Display name cannot be empty.' };
  }
  if (cleaned.length > 20) {
    return { ok: false, error: 'Display name must be 20 characters or fewer.' };
  }
  return { ok: true, value: cleaned };
}

/** Validates an avatar ID or returns a random valid avatar ID. */
export function sanitizeAvatarId(raw: unknown): string {
  if (typeof raw === 'string' && (AVATAR_IDS as readonly string[]).includes(raw)) {
    return raw;
  }
  const idx = Math.floor(Math.random() * AVATAR_IDS.length);
  return AVATAR_IDS[idx];
}

/** Validates and cleans an in-game chat message (1-200 characters). */
export function sanitizeChatText(raw: unknown): SanitizeResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Chat message must be text.' };
  }
  const cleaned = raw.replace(CONTROL_CHARS_RE, '').replace(MULTI_SPACE_RE, ' ').trim();
  if (cleaned.length === 0) {
    return { ok: false, error: 'Chat message cannot be empty.' };
  }
  if (cleaned.length > 200) {
    return { ok: false, error: 'Chat message must be 200 characters or fewer.' };
  }
  return { ok: true, value: cleaned };
}

/** Normalizes a Room ID input to uppercase alphanumeric characters. */
export function normalizeRoomId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

/** Validates an emoji reaction against the curated reaction palette. */
export function isValidReactionEmoji(raw: unknown): raw is string {
  return typeof raw === 'string' && (REACTION_EMOJIS as readonly string[]).includes(raw);
}

/** Lightweight sliding-window per-socket rate limiter. */
export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, number[]>();

  /** Returns true when `key` is within `maxRequests` inside `windowMs`. */
  allow(key: string, maxRequests: number, windowMs: number, now = Date.now()): boolean {
    const cutoff = now - windowMs;
    const timestamps = this.buckets.get(key) ?? [];
    const active = timestamps.filter((ts) => ts > cutoff);

    if (active.length >= maxRequests) {
      this.buckets.set(key, active);
      return false;
    }

    active.push(now);
    this.buckets.set(key, active);
    return true;
  }

  /** Removes all buckets for a disconnected socket prefix. */
  clearPrefix(prefix: string): void {
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        this.buckets.delete(key);
      }
    }
  }
}
