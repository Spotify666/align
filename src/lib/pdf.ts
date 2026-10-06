"use client";
// Downloadable PDF of a report. Generated on the device from the same immutable
// payload and template text the screen shows, so the file never disagrees with it.

import type { AnalysisPayload } from "@/engine/types";
import { templateReport } from "@/engine/report";
import { SHOT_DISPLAY } from "@/engine/classify";
import { DOMAIN_LABELS } from "@/engine/registry";
import { fmt } from "@/engine/scoring";
import { plainRange, plainReading, plainValue } from "@/engine/plain";

const STATUS: Record<string, string> = {
  valid: "Valid front-foot defence",
  invalid_for_requested_analysis: "Different shot detected",
  uncertain_shot: "Shot not confirmed",
  capture_failed: "Couldn't analyse",
};

// Standard PDF fonts cover WinAnsi only; map the few symbols outside it.
const clean = (s: string) =>
  s
    .replaceAll("≥", ">=")
    .replaceAll("≤", "<=")
    .replaceAll("→", "->")
    .replaceAll("←", "<-")
    .replaceAll("Δ", "change ")
    .replaceAll("≈", "~")
    .replaceAll("‑", "-")
    .replace(/[^\u0000-ÿ–—‘’“”•…]/g, "");

export async function downloadReportPdf(p: AnalysisPayload, opts: { title?: string; evidenceImage?: string | null } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  let y = M;
  const ink: [number, number, number] = [18, 22, 26];
  const muted: [number, number, number] = [92, 99, 107];
  const gold: [number, number, number] = [160, 118, 20];

  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
      if (p.demo) watermark();
    }
  };
  const text = (s: string, size = 10, color = ink, style: "normal" | "bold" = "normal", gap = 4) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(clean(s), W - 2 * M) as string[];
    for (const line of lines) {
      ensure(size + 2);
      doc.text(line, M, y + size);
      y += size + 3;
    }
    y += gap;
  };
  const heading = (s: string) => {
    ensure(40);
    y += 6;
    doc.setDrawColor(215, 166, 42);
    doc.setLineWidth(1);
    doc.line(M, y, M + 28, y);
    y += 8;
    text(s.toUpperCase(), 9, gold, "bold", 2);
  };
  const watermark = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(200, 120, 20);
    doc.text("DEMO DATA - synthetic fixture, not a real recording", W - M, 26, { align: "right" });
  };

  if (p.demo) watermark();
  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...ink);
  doc.text("ALIGN", M, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(clean(`Front-foot defence report · ${new Date(p.created_at).toLocaleString()}`), W - M, y + 12, { align: "right" });
  y += 30;
  if (opts.title) text(opts.title, 10, muted, "normal", 2);

  // Verdict first
  text(p.mode === "posture_screen" && p.analysis_status !== "capture_failed" ? "Photo check" : (STATUS[p.analysis_status] ?? ""), 11, gold, "bold", 2);
  text(p.headline, 17, ink, "bold", 4);
  if (p.analysis_status !== "valid" && p.mode !== "posture_screen") text("No technique score: a score is only given to a confirmed front-foot defence.", 10, ink, "bold");
  if (p.technique_index) text(`Technique score ${p.technique_index.value} / 100`, 10, muted);

  if (opts.evidenceImage) {
    try {
      const props = doc.getImageProperties(opts.evidenceImage);
      const w = W - 2 * M;
      const h = Math.min(260, (w * props.height) / props.width);
      ensure(h + 16);
      doc.addImage(opts.evidenceImage, "PNG", M, y, (h * props.width) / props.height, h);
      y += h + 6;
      text("Evidence frame with tracked body, bat and ball.", 8, muted);
    } catch {
      /* image unavailable: report continues without it */
    }
  }

  // Delivery context
  if (p.mode === "video" && p.analysis_status !== "capture_failed") {
    heading("Delivery context");
    const d = p.delivery;
    text(
      d.available
        ? `${d.lengthLabel ?? "unclear"} length${d.bounceDistanceM !== null ? `, bounce ${d.bounceDistanceM.toFixed(1)} m from stumps (±${(d.bounceUncertaintyM ?? 0).toFixed(1)} m)` : ", bounce not seen"}. ${d.reason ?? ""}`
        : `Not claimed: ${d.reason ?? "ball not visible"}`,
    );
  }

  // Narrative (same contract-validated text as the screen)
  const report = templateReport(p);
  for (const s of report.sections) {
    if (s.heading === "Limits of this result") continue;
    heading(s.heading);
    for (const x of s.sentences) text(`• ${x.text}`, 10, ink, "normal", 1);
  }

  // Domains and measures
  if (p.analysis_status === "valid") {
    heading("Six domains");
    for (const d of p.domains) text(`${DOMAIN_LABELS[d.domain]}: ${d.status.replace("_", " ")} — ${d.summary}`, 9.5, ink, "normal", 1);
    heading("Movement indicators");
    doc.setFontSize(8.5);
    const cols = [M, M + 170, M + 270, M + 380];
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...muted);
    ["Check", "You", "Aim for", ""].forEach((h, i) => doc.text(h, cols[i]!, y + 9));
    y += 15;
    doc.setFont("helvetica", "normal");
    for (const m of p.metrics) {
      ensure(14);
      doc.setTextColor(...ink);
      doc.text(clean(m.name), cols[0]!, y + 9);
      doc.text(clean(m.value !== null ? plainValue(m) : "not checked"), cols[1]!, y + 9);
      doc.text(clean(m.range ? plainRange(m) : "—"), cols[2]!, y + 9);
      doc.setTextColor(...(m.inRange === false ? ([180, 57, 47] as [number, number, number]) : muted));
      doc.text(clean(m.status === "not_measured" ? "" : m.inRange === null ? "not graded" : plainReading(m)), cols[3]!, y + 9);
      y += 13;
    }
    y += 4;
    text("Where each range comes from: see the Science page.", 8, muted);
  }

  // Ungraded observations (uncertain shot) and posture screens (photos): values only, no ranges.
  const ungraded = (title: string, list: typeof p.metrics, note: string) => {
    const shown = list.filter((m) => m.value !== null);
    if (!shown.length) return;
    heading(title);
    for (const m of shown) text(`• ${m.name}: ${fmt(m)}${m.uncertainty !== null ? ` ±${m.uncertainty.toFixed(m.decimals)}` : ""}`, 9.5, ink, "normal", 1);
    text(note, 8, muted);
  };
  if (p.observations?.length) ungraded("What we could still see", p.observations, "Not graded and no score: the shot wasn't confirmed as a front-foot defence.");
  if (p.mode === "posture_screen" && p.analysis_status !== "capture_failed") {
    if (p.photo_set) {
      heading("Photos");
      for (const ph of p.photo_set) {
        const vals = ph.observations.filter((m) => m.value !== null).map((m) => `${m.name} ${fmt(m)}`);
        text(`Photo ${ph.frame + 1}${ph.phase ? ` (${ph.phase})` : ""}: ${vals.length ? vals.join(" · ") : (ph.note ?? "not measured")}`, 9.5, ink, "normal", 1);
      }
    }
  }

  const limits = p.limitations.filter((l) => ["lim_demo", "lim_photo", "lim_photo_set", "lim_no_bat", "lim_no_ball", "lim_body_led"].includes(l.id));
  if (limits.length) {
    heading("Good to know");
    for (const l of limits) text(`• ${l.text}`, 9, muted, "normal", 0);
  }
  y += 6;
  text(`Aline ${p.versions.engine} · result ${p.result_hash.slice(0, 12)}`, 7, muted);
  text("Not a medical assessment. Movement indicators describe technique, not health or injury.", 8, muted);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`align · page ${i} of ${pages}`, W / 2, H - 20, { align: "center" });
  }

  const name = `align-front-foot-defence-${p.created_at.slice(0, 10)}-${p.analysis_status.replaceAll("_", "-")}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
