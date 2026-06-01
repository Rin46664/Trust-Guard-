// In-memory rate limiter for verification attempts
// Tracks per-user attempt counts and cooldowns

interface UserRateInfo {
  attempts: number;
  firstAttemptAt: number;
  cooldownUntil?: number;
}

const store = new Map<string, UserRateInfo>();

const MAX_ATTEMPTS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const COOLDOWN_DURATIONS: Record<number, number> = {
  2: 5 * 60 * 1000,   // 5 min after 2nd failure
  3: 15 * 60 * 1000,  // 15 min after 3rd failure
  4: 60 * 60 * 1000,  // 1 hour after 4th failure
  5: 24 * 60 * 60 * 1000, // 24 hours after 5th failure
};

function getKey(userId: string, guildId: string) {
  return `${userId}:${guildId}`;
}

export function isRateLimited(userId: string, guildId: string): { limited: boolean; cooldownMs?: number } {
  const key = getKey(userId, guildId);
  const info = store.get(key);

  if (!info) return { limited: false };

  const now = Date.now();

  if (info.cooldownUntil && now < info.cooldownUntil) {
    return { limited: true, cooldownMs: info.cooldownUntil - now };
  }

  // Reset window if hour has passed
  if (now - info.firstAttemptAt > HOUR_MS) {
    store.delete(key);
    return { limited: false };
  }

  if (info.attempts >= MAX_ATTEMPTS_PER_HOUR) {
    const cooldownMs = COOLDOWN_DURATIONS[Math.min(info.attempts, 5)] ?? HOUR_MS;
    info.cooldownUntil = now + cooldownMs;
    return { limited: true, cooldownMs };
  }

  return { limited: false };
}

export function recordAttempt(userId: string, guildId: string): void {
  const key = getKey(userId, guildId);
  const now = Date.now();
  const info = store.get(key);

  if (!info || now - info.firstAttemptAt > HOUR_MS) {
    store.set(key, { attempts: 1, firstAttemptAt: now });
  } else {
    info.attempts++;
    const cooldownMs = COOLDOWN_DURATIONS[info.attempts];
    if (cooldownMs) {
      info.cooldownUntil = now + cooldownMs;
    }
  }
}

export function clearRateLimit(userId: string, guildId: string): void {
  store.delete(getKey(userId, guildId));
}

export function formatCooldown(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}

// Mass join detection: track join timestamps per guild
const joinTimestamps = new Map<string, number[]>();

export function recordJoin(guildId: string): boolean {
  const now = Date.now();
  const WINDOW_MS = 60 * 1000; // 1 minute
  const MASS_JOIN_THRESHOLD = 10;

  const joins = (joinTimestamps.get(guildId) ?? []).filter(t => now - t < WINDOW_MS);
  joins.push(now);
  joinTimestamps.set(guildId, joins);

  return joins.length >= MASS_JOIN_THRESHOLD;
}
