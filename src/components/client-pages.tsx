"use client";

import { PageLoading } from "@/components/common/page-loading";
import dynamic from "next/dynamic";

const Loading = () => <PageLoading what="Opening the page…" />;

// These pages read on-device storage, so they render on the client only.
export const ProfileClient = dynamic(() => import("./profile/profile-page").then((m) => m.ProfilePage), { ssr: false, loading: Loading });
export const SessionsClient = dynamic(() => import("./sessions/sessions-page").then((m) => m.SessionsPage), { ssr: false, loading: Loading });
export const ProgressClient = dynamic(() => import("./progress/progress-page").then((m) => m.ProgressPage), { ssr: false, loading: Loading });
export const CoachClient = dynamic(() => import("./coach/coach-page").then((m) => m.CoachPage), { ssr: false, loading: Loading });
