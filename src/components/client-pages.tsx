"use client";

import dynamic from "next/dynamic";

const Loading = () => <p className="mx-auto max-w-7xl px-4 py-12 text-fg-muted">Loading…</p>;

// These pages read on-device storage, so they render on the client only.
export const ProfileClient = dynamic(() => import("./profile/profile-page").then((m) => m.ProfilePage), { ssr: false, loading: Loading });
export const SessionsClient = dynamic(() => import("./sessions/sessions-page").then((m) => m.SessionsPage), { ssr: false, loading: Loading });
export const ProgressClient = dynamic(() => import("./progress/progress-page").then((m) => m.ProgressPage), { ssr: false, loading: Loading });
export const CoachClient = dynamic(() => import("./coach/coach-page").then((m) => m.CoachPage), { ssr: false, loading: Loading });
