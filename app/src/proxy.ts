import { NextRequest, NextResponse } from "next/server";

const LOGIN_PATH = "/login";

export default function proxy(request: NextRequest) {
  const authPassword = process.env.SITE_PASSWORD;

  // If no password is set, allow access (local dev)
  if (!authPassword) return NextResponse.next();

  // Allow login page and login API
  if (
    request.nextUrl.pathname === LOGIN_PATH ||
    request.nextUrl.pathname === "/api/auth"
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = request.cookies.get("site_auth")?.value;
  if (authCookie === authPassword) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL(LOGIN_PATH, request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
