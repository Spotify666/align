import type { AnalysisPayload, AnalysisStatus } from "@/engine/types";
import { CameraOff, Check, Question, Swap } from "../icons";

export const STATUS_META: Record<
  AnalysisStatus | "posture_screen",
  { label: string; short: string; tone: string; ring: string; bg: string; Icon: typeof Check }
> = {
  valid: { label: "Valid front-foot defence", short: "Valid", tone: "text-ok", ring: "border-ok/50", bg: "bg-ok/10", Icon: Check },
  invalid_for_requested_analysis: {
    label: "Different shot detected",
    short: "Different shot",
    tone: "text-bad",
    ring: "border-bad/50",
    bg: "bg-bad/10",
    Icon: Swap,
  },
  uncertain_shot: { label: "Shot not confirmed", short: "Not confirmed", tone: "text-warn", ring: "border-warn/50", bg: "bg-warn/10", Icon: Question },
  capture_failed: { label: "Couldn't analyse", short: "Couldn't analyse", tone: "text-neutral", ring: "border-neutral/50", bg: "bg-neutral/10", Icon: CameraOff },
  posture_screen: { label: "Photo check", short: "Photo", tone: "text-warn", ring: "border-warn/50", bg: "bg-warn/10", Icon: Question },
};

export const statusKey = (p: Pick<AnalysisPayload, "analysis_status" | "mode">) =>
  p.mode === "posture_screen" && p.analysis_status !== "capture_failed" ? "posture_screen" : p.analysis_status;

/** The verdict's label, naming the shot that was confirmed. */
export const statusLabel = (p: Pick<AnalysisPayload, "analysis_status" | "mode" | "requested_shot">) =>
  statusKey(p) === "valid" && p.requested_shot === "back_foot_defence" ? "Valid back-foot defence" : STATUS_META[statusKey(p)].label;

export function StatusPill({ payload }: { payload: Pick<AnalysisPayload, "analysis_status" | "mode"> }) {
  const m = STATUS_META[statusKey(payload)];
  return (
    <span className={`chip ${m.ring} ${m.tone}`}>
      <m.Icon size={14} /> {m.short}
    </span>
  );
}

export function ConfidenceChip({ label, value, note }: { label: string; value: number; note?: string }) {
  const pct = Math.round(value * 100);
  return (
    <span className="chip border-line-strong text-fg-muted" title={note}>
      <span>{label}</span>
      <span className="num text-fg">{pct}%</span>
      {note && <span className="text-fg-subtle font-normal">· {note}</span>}
    </span>
  );
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return <span className="demo-badge">DEMO DATA</span>;
}
