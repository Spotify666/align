// Following the batter in footage that zooms, pans and cuts (broadcast clips): the
// batter is identified at the stroke, and every earlier frame is linked back from there.
import { describe, expect, it } from "vitest";
import { linkBack } from "@/lib/capture/link";
import { strokeSegment } from "@/lib/capture/segments";
import { spikeCuts } from "@/lib/capture/picture-cuts";
import type { Box } from "@/lib/capture/pose";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { quantise } from "@/engine/tracks-codec";
import { J, type CaptureObservation } from "@/engine/types";

const box = (cx: number, cy: number, h: number): Box => ({ x: cx - h * 0.2, y: cy - h / 2, w: h * 0.4, h, score: 0.9 });

describe("linking the batter back from the stroke", () => {
  // A broadcast zoom: the batter grows from small at the far end to large in the centre.
  // Early on, the spot the batter ends up in holds the bowler and the umpire instead.
  const N = 40;
  const batter = (i: number) => box(0.55 - 0.05 * (i / (N - 1)), 0.3 + 0.25 * (i / (N - 1)), 0.1 * 5 ** (i / (N - 1)));
  const others = (i: number) => (i < 26 ? [box(0.45, 0.6, 0.45), box(0.6, 0.66, 0.34)] : []);

  it("follows the batter through a zoom, never the person standing where the batter ends up", () => {
    const people = Array.from({ length: N }, (_, i) => [...others(i), batter(i)]);
    const linked = linkBack(people, batter(N - 1), N - 1, 1, 8);
    for (let i = 0; i < N; i++) expect(linked[i], `frame ${i}`).toEqual(batter(i));
  });

  it("bridges a missed detection or two", () => {
    const people = Array.from({ length: N }, (_, i) => (i === 20 || i === 21 ? others(i) : [...others(i), batter(i)]));
    const linked = linkBack(people, batter(N - 1), N - 1, 1, 8);
    expect(linked[20]).toBeNull();
    expect(linked[21]).toBeNull();
    expect(linked[0]).toEqual(batter(0));
  });

  it("stops at a cut: frames from another camera shot aren't the batter", () => {
    const people = Array.from({ length: N }, (_, i) => (i < 12 ? [box(0.15, 0.2, 0.2), box(0.8, 0.7, 0.3)] : [...others(i), batter(i)]));
    const linked = linkBack(people, batter(N - 1), N - 1, 1, 4);
    for (let i = 0; i < 12; i++) expect(linked[i], `frame ${i}`).toBeNull();
    expect(linked[12]).toEqual(batter(12));
  });
});

describe("the stroke's own camera shot", () => {
  const person = (cx: number, cy: number, h: number) =>
    Array.from({ length: 17 }, (_, j) => [cx + ((j % 3) - 1) * h * 0.12, cy - h / 2 + (j / 16) * h, 0.9] as [number, number, number]);
  it("is kept even when it is short, never swapped for a longer piece of something else", () => {
    // 30 frames of one shot, a cut to a 15-frame close-up holding the stroke, a cut to 30 more.
    const body = Array.from({ length: 75 }, (_, i) => (i < 30 ? person(0.3, 0.6, 0.3) : i < 45 ? person(0.5, 0.5, 0.7) : person(0.8, 0.3, 0.15)));
    expect(strokeSegment(body, 1, 38, 25)).toEqual([30, 45]);
  });
});

describe("cuts seen in the picture", () => {
  // Frame-to-frame luma change measured on a broadcast clip: a smooth zoom (rising to
  // 0.025), then a cut from a close-up to a wide shot of the same grass (0.084).
  const change = [undefined, 0.005, 0.007, 0.008, 0.009, 0.012, 0.014, 0.015, 0.017, 0.019, 0.018, 0.02, 0.022, 0.024, 0.025, 0.024, 0.022, 0.021, 0.018, 0.015, 0.014, 0.013, 0.011, 0.008, 0.006, 0.006, 0.005, 0.004, 0.003, 0.004, 0.005, 0.007, 0.007, 0.007, 0.007, 0.084, 0.008, 0.007, 0.006, 0.006];
  it("finds a cut between similar-looking shots, and leaves a zoom alone", () => {
    expect(spikeCuts(change)).toEqual([35]);
  });
  it("ends the stroke's piece at that cut even when the pose looks continuous", () => {
    const person = Array.from({ length: 17 }, (_, j) => [0.5 + ((j % 3) - 1) * 0.05, 0.3 + (j / 16) * 0.4, 0.9] as [number, number, number]);
    const body = Array.from({ length: 40 }, () => person);
    expect(strokeSegment(body, 1, 30, 25, undefined, spikeCuts(change))).toEqual([0, 35]);
  });
});

describe("back knee hidden at contact (filmed along the pitch)", () => {
  it("is read from the nearest frame where it is seen, so a sweep can still be ruled out", () => {
    const opts = { analysisId: "k", createdAt: "2026-10-03T00:00:00.000Z" };
    const obs = quantise(fixture("front_on_ffd"));
    const contact = analyze(obs, opts).events.find((e) => e.type === "contact")!.frame;
    const back = obs.athlete.handedness === "right" ? J.right_knee : J.left_knee;
    const hidden: CaptureObservation = {
      ...obs,
      body: obs.body.map((b, i) => (Math.abs(i - contact) <= 2 ? b.map((p, j) => (j === back && p ? ([p[0], p[1], 0.3] as const) : p)) : b)),
    };
    const p = analyze(hidden, opts);
    expect(p.features.find((f) => f.id === "feat_back_knee_height")).toBeDefined();
  });
});
