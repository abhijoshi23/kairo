import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  getPassphrase,
  passphraseMatches,
} from "@/lib/auth";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sign in. */
export async function POST(request: Request) {
  // Brute force is the obvious attack on a single shared passphrase, so this
  // endpoint gets a much tighter limit than the chat route.
  const { allowed, retryAfter } = await checkRateLimit(`login:${clientKey(request)}`, 8);
  if (!allowed) {
    return Response.json(
      { error: `Too many attempts. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  const passphrase = getPassphrase();
  if (!passphrase) {
    return Response.json(
      { error: "This deployment is not configured: APP_PASSPHRASE is unset." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const submitted = typeof body?.passphrase === "string" ? body.passphrase : "";

  if (!(await passphraseMatches(submitted, passphrase))) {
    // A deliberate delay. It costs an attacker far more than it costs you.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return Response.json({ error: "Incorrect passphrase." }, { status: 401 });
  }

  const store = await cookies();
  store.set(COOKIE_NAME, await createSessionToken(passphrase), {
    httpOnly: true, // JavaScript cannot read it, so XSS cannot steal it
    sameSite: "lax", // not sent on cross-site POSTs
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return Response.json({ ok: true });
}

/** Sign out. */
export async function DELETE() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
  return Response.json({ ok: true });
}
