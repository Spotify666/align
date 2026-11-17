import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { signInProblem } from "@/lib/auth-errors";

// Magic-link landing: exchange the one-time code for a session cookie. When the link failed
// (expired, used twice, opened in another browser), go back to the sign-in form with the reason
// in plain words and the same next page, instead of landing on that page signed out.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/profile";
  const back = (problem: string) =>
    NextResponse.redirect(new URL(`/signin?problem=${problem}&next=${encodeURIComponent(safeNext)}`, url.origin));

  const failed = url.searchParams.get("error_code") ?? url.searchParams.get("error");
  if (failed) return back(signInProblem(url.searchParams.get("error_code"), url.searchParams.get("error_description")));
  if (!code) return back("failed");

  const res = NextResponse.redirect(new URL(safeNext, url.origin));
  const sb = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return back(signInProblem(error.code, error.message));
  return res;
}
