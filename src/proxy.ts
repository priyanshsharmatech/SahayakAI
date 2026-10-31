import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 "proxy" convention (formerly "middleware").
 * Cheap edge guard: require the app session cookie for protected routes.
 * The superadmin role check for /admin happens in that page (needs the
 * signing secret, which is server-only).
 */
export function proxy(req: NextRequest) {
  const session = req.cookies.get("session")?.value;
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
