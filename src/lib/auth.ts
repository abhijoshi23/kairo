/**
 * Passphrase authentication.
 *
 * The threat this defends against: a public URL with an unauthenticated LLM
 * endpoint is a free API proxy paid for with your credit card. Bots scan for
 * exactly that. Everything else in this file follows from wanting to close it.
 *
 * Design notes worth understanding:
 *
 * - The cookie holds no secret. It holds an expiry plus an HMAC of that expiry,
 *   signed with a key only the server knows. A forger cannot produce a valid
 *   signature, and the server keeps no session store to look anything up in.
 *
 * - The signing key is derived from APP_PASSPHRASE itself. That is deliberate:
 *   changing the passphrase invalidates every existing session, which is what
 *   you want the moment you suspect it leaked.
 *
 * - Both comparisons are constant-time. A naive === returns faster on an early
 *   mismatch, which leaks the answer one character at a time.
 *
 * - Web Crypto (not node:crypto) so this same file runs in Edge middleware.
 */

export const COOKIE_NAME = "kairo_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Compare without leaking where two equal-length strings first differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/**
 * Compare a submitted passphrase against the real one.
 *
 * We hash both sides first so the comparison is always over two 64-character
 * hex strings. Comparing the raw values would leak the passphrase's length
 * through the early length check.
 */
export async function passphraseMatches(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(input), sha256Hex(expected)]);
  return constantTimeEqual(a, b);
}

/** Mint a session token: "<expiry>.<hmac of expiry>". */
export async function createSessionToken(secret: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  return `${expiresAt}.${await hmacHex(secret, String(expiresAt))}`;
}

/** True only for a token this server signed that has not expired. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token || !secret) return false;

  const separator = token.indexOf(".");
  if (separator === -1) return false;

  const expiresAtRaw = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return constantTimeEqual(signature, await hmacHex(secret, expiresAtRaw));
}

/** The configured passphrase, or null if the app has not been set up. */
export function getPassphrase(): string | null {
  const value = process.env.APP_PASSPHRASE?.trim();
  return value && value.length > 0 ? value : null;
}
