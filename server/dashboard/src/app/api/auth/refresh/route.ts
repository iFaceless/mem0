import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_ENDPOINTS } from "@/utils/api-endpoints";
import { getServerApiUrl } from "@/lib/server-api-url";

const COOKIE_NAME = "mem0_refresh_token";
const COOKIE_SECURE = process.env.DASHBOARD_COOKIE_SECURE === "true";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60, // 30 days
};

export async function POST() {
  console.log("[auth/refresh] POST — refreshing session");
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(COOKIE_NAME)?.value;

  if (!refreshToken) {
    console.log("[auth/refresh] POST — no refresh token cookie found, returning 401");
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  console.log("[auth/refresh] POST — calling backend /auth/refresh with token");
  const res = await fetch(`${getServerApiUrl()}${AUTH_ENDPOINTS.REFRESH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    console.log("[auth/refresh] POST — backend refresh failed, status:", res.status);
    cookieStore.delete(COOKIE_NAME);
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  const data = await res.json();
  console.log("[auth/refresh] POST — backend refresh succeeded, setting new cookie (secure=%s)", COOKIE_SECURE);

  cookieStore.set(COOKIE_NAME, data.refresh_token, COOKIE_OPTIONS);

  return NextResponse.json({ access_token: data.access_token });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const cookieStore = await cookies();

  if (!body.refresh_token) {
    console.log("[auth/refresh] PUT — missing refresh_token in body");
    return NextResponse.json(
      { error: "Missing refresh_token" },
      { status: 400 },
    );
  }

  console.log("[auth/refresh] PUT — storing refresh token as cookie (secure=%s)", COOKIE_SECURE);
  cookieStore.set(COOKIE_NAME, body.refresh_token, COOKIE_OPTIONS);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  console.log("[auth/refresh] DELETE — clearing refresh token cookie");
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
