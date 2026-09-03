/**
 * Rate limiting, with a real backend when you have one and an honest
 * fallback when you don't.
 *
 * BE HONEST ABOUT WHAT THE FALLBACK IS. The in-memory counter lives in one
 * process's memory, so on a serverless host (Vercel) every instance keeps its
 * own tally and every cold start resets it. Your real limit there is roughly
 * `limit x warm instances`. It is a stumble guard, not a spend guard.
 *
 * Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (a free Upstash
 * database) and every instance shares one real counter instead. That is the
 * only thing that changes - callers still just get {allowed, retryAfter}.
 *
 * The three things that actually protect you, in order:
 *   1. A hard spend limit set in your provider's billing console.
 *   2. Authentication (see src/middleware.ts) - no strangers, no abuse.
 *   3. This.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// One Ratelimit instance per distinct limit value (chat/transcribe/speak
// share the default; login passes its own tighter one) - cheap to keep a
// handful of these around for the life of the process.
const limiters = new Map<number, Ratelimit>();

function limiterFor(limit: number): Ratelimit {
  let limiter = limiters.get(limit);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, "60 s"),
      prefix: "kairo",
    });
    limiters.set(limit, limiter);
  }
  return limiter;
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

function checkRateLimitInMemory(key: string, limit: number): { allowed: boolean; retryAfter: number } {
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

export async function checkRateLimit(
  key: string,
  limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 20),
): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!redis) return checkRateLimitInMemory(key, limit);

  const { success, reset } = await limiterFor(limit).limit(key);
  return { allowed: success, retryAfter: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
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
