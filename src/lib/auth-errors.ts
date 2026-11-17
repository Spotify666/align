// Plain words for what can go wrong with an email sign-in link. Pure: the callback route and the
// sign-in form both read it, and tests/auth-errors.test.ts holds it to the cases seen in the logs.

export type SignInProblem = "expired" | "other_browser" | "too_many" | "failed";

export const SIGN_IN_WORDS: Record<SignInProblem, string> = {
  expired: "That link has expired or was already used. Ask for a new one below.",
  other_browser: "Open the link in the browser you asked from. On Android, choose Open in Chrome, not inside Gmail.",
  too_many: "Too many links asked for. Wait an hour, then try again.",
  failed: "Sign-in didn't work. Ask for a new link below.",
};

/** What went wrong, from Supabase's error code or message (either may be missing). */
export function signInProblem(code?: string | null, message?: string | null): SignInProblem {
  const c = (code ?? "").toLowerCase();
  const m = (message ?? "").toLowerCase();
  // The browser check first: its message also says "invalid".
  if (c === "bad_code_verifier" || c === "flow_state_not_found" || /code verifier|flow state/.test(m)) return "other_browser";
  if (c === "otp_expired" || /expired|invalid|not found|already (been )?used/.test(m)) return "expired";
  if (c === "over_email_send_rate_limit" || /rate limit|too many/.test(m)) return "too_many";
  return "failed";
}

/** A `problem` value from the address, if it is one we know. */
export function readProblem(value: string | null): SignInProblem | null {
  return value && value in SIGN_IN_WORDS ? (value as SignInProblem) : null;
}
