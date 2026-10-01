import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Magic-link landing: exchange the one-time code for a session cookie.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/profile";
  const res = NextResponse.redirect(new URL(safeNext, url.origin));
  if (code) {
    const sb = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    });
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return res;
}
