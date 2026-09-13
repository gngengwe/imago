import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, hashPassword } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  // Vercel Cron (see vercel.json) hits /api/admin/cleanup on a schedule and
  // can't carry the browser's password cookie, so it authenticates with this
  // header instead. Checked first so it doesn't change behavior for anything
  // else — every other route/request still needs the normal cookie below.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return NextResponse.next();
  }

  const password = process.env.ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await hashPassword(password);
  if (cookie === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
