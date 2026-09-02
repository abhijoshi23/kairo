import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";

/**
 * Runs before every matched request. This is the gate — not the UI, not the
 * chat component. Anything that costs money sits behind it.
 *
 * Fails CLOSED in production: if APP_PASSPHRASE is unset, nothing is served.
 * A misconfigured deployment that silently runs wide open is exactly the
 * failure this whole feature exists to prevent. In development it stays open,
 * so `npm run dev` does not nag you on every restart.
 */
export async function middleware(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const passphrase = process.env.APP_PASSPHRASE?.trim();

  if (!passphrase) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return isApiRoute
      ? NextResponse.json(
          { error: "This deployment is not configured: APP_PASSPHRASE is unset." },
          { status: 503 },
        )
      : NextResponse.redirect(new URL("/login?error=unconfigured", request.url));
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (await verifySessionToken(token, passphrase)) {
    return NextResponse.next();
  }

  return isApiRoute
    ? NextResponse.json({ error: "Not signed in." }, { status: 401 })
    : NextResponse.redirect(new URL("/login", request.url));
}

// Everything except static assets and the login screen itself.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/login).*)"],
};
