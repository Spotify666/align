// The lesson's figure is drawn only from what the tracker saw: these checks hold the pose
// it is drawn from to that (confidences carried, guesses marked as unseen, moving a pose
// keeps them).
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { J, JOINTS, type ImgPoint } from "@/engine/types";
import { alignAt, figurePose, posePoints } from "@/components/lesson/pose";

const obs = fixture("valid_ffd");
const p = analyze(obs, { analysisId: "l", createdAt: "2026-01-01T00:00:00.000Z" });
const contact = p.events.find((e) => e.type === "contact")!.frame;
const aspect = obs.media.width / obs.media.height;
const body = obs.body[contact]!;

describe("the lesson's landmark figure", () => {
  it("carries how sure the tracker was of every point", () => {
    const pose = figurePose(body, aspect, "right")!;
    expect(pose.seen).toBeDefined();
    // Right-hander: the front side is the left.
    expect(pose.seen!.fk).toBe(body[J.left_knee]![2]);
    expect(pose.seen!.bw).toBe(body[J.right_wrist]![2]);
    expect(pose.seen!.head).toBe(body[J.nose]![2]);
  });

  it("marks a point placed by guess as unseen, so it isn't drawn", () => {
    const hidden: ImgPoint[] = body.map((q, i) => (JOINTS[i] === "left_elbow" || JOINTS[i] === "left_wrist" ? null : q));
    const pose = figurePose(hidden, aspect, "right")!;
    // The point still exists (other drawings place it), but it is marked as not seen.
    expect(pose.fe).toBeDefined();
    expect(pose.seen!.fe).toBe(0);
    expect(pose.seen!.fw).toBe(0);
    expect(pose.seen!.be).toBeGreaterThan(0);
  });

  it("keeps the confidences when the pose is moved, and frames on points only", () => {
    const pose = figurePose(body, aspect, "right")!;
    const moved = alignAt(pose, [10, 100]);
    expect(moved.seen).toEqual(pose.seen);
    expect(moved.fa).toEqual([10, 100]);
    const pts = posePoints(moved);
    expect(pts.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))).toBe(true);
    expect(pts.length).toBe(17);
  });
});

import { SEEN_MIN, SURE_MIN } from "@/lib/viz";
import { th } from "@/engine/registry";

describe("one rule for drawing the body, everywhere", () => {
  it("draws solid only what the engine itself uses, and nothing it didn't see", () => {
    expect(SURE_MIN).toBe(th("tracking.joint_min_conf"));
    expect(SEEN_MIN).toBeGreaterThan(0);
    expect(SEEN_MIN).toBeLessThan(SURE_MIN);
  });
});
