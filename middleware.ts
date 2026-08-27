import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, hashPassword } from "@/lib/auth";

export async function middleware(req: NextRequest) {
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
