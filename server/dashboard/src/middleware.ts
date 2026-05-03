import { NextRequest, NextResponse } from "next/server";
import { AUTH_ENDPOINTS } from "@/utils/api-endpoints";
import { getServerApiUrl } from "@/lib/server-api-url";

const PUBLIC_PATHS = [
  "/_next",
  "/api/auth",
  "/api/health",
  "/fonts",
  "/favicon",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasRefreshToken = request.cookies.has("mem0_refresh_token");

  console.log("[middleware] path=%s hasRefreshToken=%s", pathname, hasRefreshToken);

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    console.log("[middleware] path=%s is public, passing through", pathname);
    return NextResponse.next();
  }

  if (pathname === "/" || pathname === "/login" || pathname === "/setup") {
    try {
      const res = await fetch(
        `${getServerApiUrl()}${AUTH_ENDPOINTS.SETUP_STATUS}`,
      );
      if (res.ok) {
        const { needsSetup } = await res.json();
        console.log("[middleware] setup check: needsSetup=%s", needsSetup);

        if (needsSetup && pathname !== "/setup") {
          console.log("[middleware] redirecting to /setup (needsSetup=true)");
          return NextResponse.redirect(new URL("/setup", request.url));
        }
        if (!needsSetup && pathname === "/setup") {
          console.log("[middleware] redirecting to /login (setup complete)");
          return NextResponse.redirect(new URL("/login", request.url));
        }
      }
    } catch {
      console.log("[middleware] setup check failed (API unreachable)");
      // API unreachable — fall through to default behavior
    }
  }

  if (pathname === "/login" || pathname === "/setup") {
    console.log("[middleware] path=%s is auth page, passing through", pathname);
    return NextResponse.next();
  }

  if (pathname === "/") {
    const target = hasRefreshToken ? "/dashboard/requests" : "/login";
    console.log("[middleware] redirecting / to %s", target);
    return NextResponse.redirect(
      new URL(target, request.url),
    );
  }

  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    console.log("[middleware] redirecting /dashboard to /dashboard/requests");
    return NextResponse.redirect(new URL("/dashboard/requests", request.url));
  }

  if (!hasRefreshToken) {
    console.log("[middleware] path=%s — no refresh token, redirecting to /login", pathname);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  console.log("[middleware] path=%s — authenticated, passing through", pathname);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts|images|icons).*)"],
};
