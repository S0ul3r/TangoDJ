import { NextResponse } from "next/server";
import {
  refreshCookieOptions,
  SPOTIFY_REFRESH_COOKIE,
} from "@/lib/authCookies";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SPOTIFY_REFRESH_COOKIE, "", refreshCookieOptions(0));
  return res;
}
