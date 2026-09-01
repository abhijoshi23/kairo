/**
 * A deliberately tiny in-memory rate limiter.
 *
 * Why it exists: your API key is attached to every request this server makes.
 * Without a guard, one loop in a browser tab can spend real money. This is the
 * cheapest possible protection.
 *
 * Its limits, honestly: the counter lives in this process's memory, so it
 * resets on restart and is not shared between serverless instances. For a real
 * deployment you would move this to Redis (e.g. Upstash). Good enough for a
 * personal app; not a security boundary.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export function checkRateLimit(key: string): { allowed: boolean; retryAfter: number } {
  const limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 20);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client identity behind a proxy. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}

// Keep the map from growing forever in a long-lived server.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (now > bucket.resetAt) buckets.delete(key);
}, WINDOW_MS).unref?.();
