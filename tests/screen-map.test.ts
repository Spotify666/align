import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN_PDF, FLOWS, SCREENS, screenById, screenImage } from "@/lib/screen-map";

// The screen map (/design), its pictures and the PDF made from it must agree with each other
// and with the app: a flow can't name a screen that isn't there, a screen can't lack its
// picture, and "Open this page" can't point at a page that doesn't exist.

const root = join(__dirname, "..");
const pub = (p: string) => join(root, "public", p);

describe("screen map", () => {
  it("every step of every flow names a screen, once per flow", () => {
    for (const f of FLOWS) {
      expect(f.steps.length, f.id).toBeGreaterThanOrEqual(2);
      expect(new Set(f.steps).size, f.id).toBe(f.steps.length);
      for (const id of f.steps) expect(screenById(id), `${f.id} → ${id}`).toBeDefined();
    }
  });

  it("every screen is in a flow, has a unique id, and says what it is for", () => {
    const used = new Set(FLOWS.flatMap((f) => f.steps));
    expect(new Set(SCREENS.map((s) => s.id)).size).toBe(SCREENS.length);
    for (const s of SCREENS) {
      expect(used.has(s.id), `${s.id} is in no flow`).toBe(true);
      expect(s.says.length, s.id).toBeGreaterThan(20);
      expect(s.options.length, s.id).toBeGreaterThan(0);
    }
  });

  it("every screen has its picture, as a JPEG of the stated size", () => {
    for (const s of SCREENS) {
      const file = pub(screenImage(s.id));
      expect(existsSync(file), `missing ${screenImage(s.id)}`).toBe(true);
      const b = readFileSync(file);
      expect([b[0], b[1]], s.id).toEqual([0xff, 0xd8]);
      expect(b.length, `${s.id} is too heavy for a phone`).toBeLessThan(160_000);
    }
  });

  it("\"Open this page\" goes to a page that exists", () => {
    const page = (route: string) => existsSync(join(root, "src/app", route, "page.tsx"));
    for (const s of SCREENS) {
      if (!s.href) continue;
      const path = s.href.split("#")[0]!.replace(/\/$/, "");
      const parts = path.split("/").filter(Boolean);
      const ok =
        path === "" ? page("") :
        parts[0] === "sample" && parts.length >= 2 ? page(parts.length === 3 ? "sample/[key]/print" : "sample/[key]") :
        page(path.slice(1));
      expect(ok, `${s.id} → ${s.href}`).toBe(true);
    }
  });

  it("the document to download is there and is a PDF", () => {
    const file = pub(DESIGN_PDF);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
    expect(statSync(file).size).toBeLessThan(8_000_000);
  });

  it("never shows a screen as needing nothing when it needed a test account", () => {
    // A picture made with a made-up account or a stand-in device says so.
    for (const id of ["coach-1", "coach-2", "coach-3", "feedback", "manage", "pair-2", "lineup", "report-model"]) {
      expect(screenById(id)?.captured, id).toBeTruthy();
    }
  });
});
