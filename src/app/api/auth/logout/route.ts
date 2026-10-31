import { destroySession } from "@/lib/session";
import { NextResponse } from "next/server";

// POST-only: a GET logout is CSRF-triggerable (a stray <img>/link could log the
// user out) and the old redirect crashed when NEXT_PUBLIC_APP_URL was unset.
// Callers POST and handle navigation client-side.
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
