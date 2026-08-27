import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const expected = process.env.ACCESS_PASSWORD;
  const { password, next } = await req.json();

  if (!expected || typeof password !== "string" || password !== expected) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await hashPassword(expected);
  const res = NextResponse.json({ ok: true, next: typeof next === "string" ? next : "/" });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
