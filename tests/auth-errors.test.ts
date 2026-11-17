import { describe, expect, it } from "vitest";
import { readProblem, signInProblem, SIGN_IN_WORDS } from "@/lib/auth-errors";

describe("sign-in problems in plain words", () => {
  it("names an expired or reused link (the logs: 'One-time token not found')", () => {
    expect(signInProblem("otp_expired", "Email link is invalid or has expired")).toBe("expired");
    expect(signInProblem(null, "One-time token not found")).toBe("expired");
  });
  it("names a link opened in another browser (no code verifier there)", () => {
    expect(signInProblem(null, "invalid request: both auth code and code verifier should be non-empty")).toBe("other_browser");
    expect(signInProblem("flow_state_not_found", null)).toBe("other_browser");
  });
  it("names the email limit", () => {
    expect(signInProblem("over_email_send_rate_limit", "email rate limit exceeded")).toBe("too_many");
  });
  it("falls back to a plain failure, never the raw message", () => {
    expect(signInProblem(null, "something odd")).toBe("failed");
    for (const words of Object.values(SIGN_IN_WORDS)) expect(words).not.toMatch(/verifier|otp|flow state/i);
  });
  it("reads only known problems from the address", () => {
    expect(readProblem("expired")).toBe("expired");
    expect(readProblem("<script>")).toBeNull();
    expect(readProblem(null)).toBeNull();
  });
});
