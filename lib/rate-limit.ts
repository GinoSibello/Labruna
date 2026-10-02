import { AppError } from "@/lib/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new AppError(
      "RATE_LIMITED",
      "Se hicieron demasiados intentos. Esperá unos minutos y volvé a probar.",
      429,
      true,
    );
  }
}

export function clearRateLimitsForTests() {
  buckets.clear();
}
