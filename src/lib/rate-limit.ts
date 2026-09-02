/**
 * A deliberately tiny in-memory rate limiter.
 *
 * BE HONEST ABOUT WHAT THIS IS. The counter lives in one process's memory, so
 * on a serverless host (Vercel) every instance keeps its own tally and every
 * cold start resets it. Your real limit is roughly `limit x warm instances`.
 * It is a stumble guard, not a spend guard.
 *
 * The three things that actually protect you, in order:
 *   1. A hard spend limit set in your provider's billing console.
 *   2. Authentication (see src/middleware.ts) - no strangers, no abuse.
 *   3. This.
 *
 * To make it real, move the counter to Redis (Upstash works well on Vercel).
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export function checkRateLimit(
  key: string,
  limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 20),
): { allowed: boolean; retryAfter: number } {
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

/**
 * Best-effort client identity.
 *
 * IMPORTANT CAVEAT: `x-forwarded-for` is normally set by the client and is
 * therefore spoofable - anyone can rotate it to get a fresh bucket. It is
 * trustworthy on Vercel specifically, because Vercel overwrites the header and
 * refuses to forward external IPs precisely to prevent that.
 *
 * If you ever host this behind your own nginx, on a VPS, or on any platform
 * that passes the client's header through, this function must change: trust
 * only the value your proxy appends, not the leftmost one.
 */
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
