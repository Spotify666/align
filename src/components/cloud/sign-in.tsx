"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { readProblem, signInProblem, SIGN_IN_WORDS } from "@/lib/auth-errors";

export function SignIn() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/profile";
  const [email, setEmail] = useState("");
  const arrived = readProblem(params.get("problem")) ?? (params.get("error") ? "failed" : null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(arrived ? "error" : "idle");
  const [message, setMessage] = useState(arrived ? SIGN_IN_WORDS[arrived] : "");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setState("error");
      setMessage(SIGN_IN_WORDS[signInProblem(error.code, error.message)]);
    } else setState("sent");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14 space-y-6">
      <p className="eyebrow">Account</p>
      <h1 className="display text-5xl">Sign in</h1>
      <p className="text-fg-muted">
        Only to save reports or share with a coach.
      </p>
      {state === "sent" ? (
        <div className="card p-5">
          <p className="font-semibold">Check your email</p>
          <p className="mt-1 text-sm text-fg-muted">We sent a sign-in link to {email}. Open it on this phone, in this browser.</p>
          <button type="button" className="btn btn-quiet mt-3" onClick={() => setState("idle")}>Use another email or send again</button>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-3">
          <label className="block text-sm">
            <span className="text-fg-muted">Email</span>
            <input type="email" required autoComplete="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn btn-primary w-full" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
          {state === "error" && <p className="text-sm text-bad" role="alert">{message}</p>}
        </form>
      )}
    </div>
  );
}
