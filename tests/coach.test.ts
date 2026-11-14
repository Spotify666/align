// The coach workspace's pure parts: the review queue's order and the export.
import { describe, expect, it } from "vitest";
import { exportCsv, queueOrder, type QueueItem } from "@/lib/coach";

const item = (id: string, conf: number, at: string): QueueItem => ({
  id,
  owner_id: "p1",
  title: id,
  recorded_at: at,
  status: "valid",
  observed_label: null,
  capture_confidence: conf,
  requested_shot: "front_foot_defence",
});

describe("coach workspace", () => {
  it("puts unreviewed shots first, then the least clear recordings, then the newest", () => {
    const items = [item("clear", 0.9, "2026-11-10"), item("unclear", 0.4, "2026-11-01"), item("reviewed-unclear", 0.2, "2026-11-12"), item("clear-newer", 0.9, "2026-11-11")];
    expect(queueOrder(items, new Set(["reviewed-unclear"])).map((i) => i.id)).toEqual(["unclear", "clear-newer", "clear", "reviewed-unclear"]);
  });

  it("exports one row per assessment and assignment, quoted, with formulas neutralised", () => {
    const an = item("a1", 0.8, "2026-11-10T10:00:00Z");
    const csv = exportCsv({
      players: new Map([["p1", 'Sam "Lefty" Rao']]),
      analyses: new Map([["a1", an]]),
      assessments: [{ id: "s1", analysis_id: "a1", coach_id: "c", agrees: "agree", focus: "alignment", notes: "=HYPERLINK(\"x\")", reviewed_at: "2026-11-11", updated_at: "2026-11-11" }],
      assignments: [{ id: "g1", coach_id: "c", player_id: "p1", analysis_id: "a1", focus: "footwork", drill: "Cone stride", retest_by: "2026-11-20", note: null, status: "open", created_at: "x", updated_at: "y" }],
    });
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Sam ""Lefty"" Rao"');
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain('"Cone stride"');
    expect(lines[2]).toContain('"open"');
    // Aline's result in plain words, not internal codes.
    expect(lines[1]).toContain('"Confirmed"');
  });
});
