import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error a plain module shared with the page-check script
import { NOT_CHECKED, PAGES } from "../scripts/checks/pages-list.mjs";
import { SCREENS } from "@/lib/screen-map";

// The parts of the quality bar (.claude/skills/quality-bar) a test can hold: the lists that
// must follow the app, and rules about what a report screen may print. They fail when a page,
// an engine file or a screen is added without the checks and the docs that go with it.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(root, p)).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const routes = walk("src/app")
  .filter((f) => f.endsWith("/page.tsx"))
  .map((f) => f.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/");

describe("the quality bar", () => {
  it("every page is opened by the page check, or is listed with why it can't be", () => {
    for (const r of routes) {
      const covered = (PAGES as string[]).includes(r) || r in (NOT_CHECKED as Record<string, string>);
      expect(covered, `${r}: add it to scripts/checks/pages-list.mjs (PAGES, or NOT_CHECKED with the reason)`).toBe(true);
    }
    // And nothing is listed that is no longer a page.
    for (const r of Object.keys(NOT_CHECKED as Record<string, string>)) expect(routes, r).toContain(r);
    for (const p of PAGES as string[]) {
      const known = routes.includes(p) || routes.some((r) => r.includes("[") && new RegExp(`^${r.replace(/\[[^\]]+\]/g, "[^/]+")}$`).test(p));
      expect(known, `${p} is checked but is not a page`).toBe(true);
    }
  });

  it("every screen a person can reach is on the screen map (/design), or is plumbing", () => {
    const off = ["/analyse", "/design", "/design/print", "/design-system", "/visitors", "/report/[id]", "/report/[id]/print", "/sample/[key]", "/sample/[key]/print", "/models/edit", "/models/motion", "/library/manage", "/angles"];
    const mapped = new Set(SCREENS.flatMap((s) => [(s.href ?? "").split("#")[0]!.replace(/\/$/, "") || "/", s.route.split(",")[0]!.split("#")[0]!.trim()]));
    for (const r of routes) {
      if (off.includes(r)) continue;
      expect(mapped.has(r), `${r}: add its screen to src/lib/screen-map.ts and capture it (scripts/design)`).toBe(true);
    }
  });

  it("every engine file is in the Map (CLAUDE.md) or in an engine doc", () => {
    const docs = ["CLAUDE.md", ...readdirSync(join(root, "docs")).filter((f) => /^1[1-9]-/.test(f)).map((f) => `docs/${f}`)].map(read).join("\n");
    for (const f of readdirSync(join(root, "src/engine")).filter((x) => x.endsWith(".ts"))) {
      expect(docs.includes(f), `src/engine/${f}: name it in the Map in CLAUDE.md, with what it is for`).toBe(true);
    }
  });

  it("a report screen never prints milliseconds or a signed number", () => {
    // Standing rule 8. Looks at the words a person reads: text between tags and in template strings.
    const files = [...walk("src/components/report"), ...walk("src/components/lesson")].filter((f) => f.endsWith(".tsx"));
    for (const f of files) {
      const text = read(f)
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
        .join("\n");
      expect(/[}\d]\s?ms\b(?![:=.)\]])/.test(text) || /Milliseconds|milliseconds/.test(text), `${f}: shows milliseconds; use seconds`).toBe(false);
      expect(/negative = |\$\{[^}]*> 0 \? "\+" : ""\}/.test(text), `${f}: shows a signed number; say which way in words`).toBe(false);
    }
  });

  it("is written down where every session reads it, and CI runs it", () => {
    expect(existsSync(join(root, ".claude/skills/quality-bar/SKILL.md"))).toBe(true);
    expect(read("CLAUDE.md")).toMatch(/quality-bar/);
    const ci = read(".github/workflows/ci.yml");
    for (const step of ["npm run lint", "npm run typecheck", "npm test", "npm run build", "npm run check:pages"]) expect(ci, step).toContain(step);
    expect(JSON.parse(read("package.json")).scripts["check:pages"]).toBeTruthy();
  });
});
