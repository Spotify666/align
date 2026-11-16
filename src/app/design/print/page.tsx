import type { Metadata } from "next";
import { ENGINE_VERSION } from "@/engine/registry";
import { FLOWS, SCREENS, SCREEN_SIZE, screenById, screenImage, type Flow } from "@/lib/screen-map";

// The design document: the product end to end as A4 landscape slides. The PDF on /design is
// this page printed (scripts/design/pdf.mjs); it can also be printed from the browser.
// Everything about the screens comes from src/lib/screen-map.ts, so the page, this document and
// the PDF cannot disagree.

export const metadata: Metadata = { title: "Aline: product design, end to end", robots: { index: false } };

const PER_SLIDE = 5;
const UPDATED = "November 2026";

/** A flow's screens in slides of at most five, split evenly (7 → 4 + 3). */
function slidesOf(flow: Flow): string[][] {
  const n = Math.ceil(flow.steps.length / PER_SLIDE);
  const size = Math.ceil(flow.steps.length / n);
  return Array.from({ length: n }, (_, i) => flow.steps.slice(i * size, (i + 1) * size));
}

function Foot({ label, page }: { label: string; page: number }) {
  return (
    <div className="d-foot">
      <span>Aline · product design, end to end</span>
      <span>{label}</span>
      <span>{page}</span>
    </div>
  );
}

const PRINCIPLES: Array<[string, string]> = [
  ["Accuracy before features", "Never a confident wrong answer. A real defence is never called another shot; no other shot is ever passed as a defence. When Aline can't tell, it says so."],
  ["The line", "Head, front shoulder, front knee and front foot in one line, held until contact. Every measure says where its range comes from."],
  ["Simple first", "At most five plain sentences, then five sections closed until opened. Wording follows the level; the measurement never changes."],
  ["One main action", "Each screen has one thing to do next, in orange: Check your shot."],
  ["Yours stays yours", "The video is read on the phone and never uploaded. Sharing is a separate choice, and can be undone."],
  ["As you are", "Left-handers are named by their own sides, never drawn as mirrored right-handers. A picture says what it is."],
];

const PIPELINE: Array<[string, string]> = [
  ["Recording check", "Long enough, bright enough, the batter big enough, one person."],
  ["Body found", "Pose on the phone, frame by frame; bat and ball where seen."],
  ["Moments", "Backlift, foot down, contact. Contact decides the rest."],
  ["Which shot", "Each defence checked against its definition, from any camera position."],
  ["Measures", "Only what this recording can support; the rest is 'not measured', never zero."],
  ["Plan", "The one priority, a cue, and a drill ladder."],
];

const DATA: Array<[string, string, string]> = [
  ["Your video", "Read in the browser", "Never leaves the phone"],
  ["Tracked body points and the result", "About 20 KB a shot", "On the phone; in your account only if you save"],
  ["Profile, level, focus, body measurements", "How reports talk to you", "On the phone; the basics in your account if you sign in"],
  ["A coach's view and drills", "Their own notes on shots you shared", "Database; you and that coach only, with a history"],
  ["Two phones", "Code, start signal, clocks, the second phone's result", "Passed through, stored nowhere"],
  ["References", "A player's numbers and their signed permission", "Database; shown only while the permission holds"],
];

export default function DesignDocument() {
  const flowSlides = FLOWS.flatMap((flow, f) => slidesOf(flow).map((ids, part, all) => ({ flow, f, ids, part, parts: all.length })));
  const FRONT = 4; // cover, what it is, principles, the map
  return (
    <main id="main" className="design-doc">
      {/* 1 · Cover */}
      <section className="slide">
        <p className="d-subtle" style={{ fontSize: "9pt" }}>Product design, end to end · {UPDATED} · engine {ENGINE_VERSION}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 118mm", gap: "12mm", alignItems: "center", flex: 1 }}>
          <div>
            <h1>Aline: every flow, screen by screen.</h1>
            <p className="d-muted" style={{ marginTop: "6mm", maxWidth: "118mm", fontSize: "12pt" }}>
              AI-assisted cricket analysis on a phone. A batter films one shot; Aline finds the body on the device, says which shot it is, grades the front-foot and back-foot defence, and gives one thing to work on.
            </p>
            <p style={{ marginTop: "8mm", fontSize: "10pt" }}>
              <strong>{FLOWS.length}</strong> flows, <strong>{SCREENS.length}</strong> screens, <strong>2</strong> shots graded, <strong>0</strong> videos uploaded.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4mm" }}>
            {["landing-1", "report-1", "coach-2"].map((id) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={id} className="d-phone" src={screenImage(id)} alt="" width={SCREEN_SIZE.width} height={SCREEN_SIZE.height} />
            ))}
          </div>
        </div>
        <Foot label="alynn.vercel.app" page={1} />
      </section>

      {/* 2 · What it is */}
      <section className="slide">
        <h2>What Aline is, and who it is for</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6mm", marginTop: "7mm" }}>
          <div className="d-box">
            <h3>The problem</h3>
            <p className="d-muted" style={{ marginTop: "2mm" }}>A batter can&apos;t see their own defence. A clip shows what happened, not what to change, and a coach&apos;s eye isn&apos;t there for every ball in the nets.</p>
          </div>
          <div className="d-box">
            <h3>What Aline does</h3>
            <p className="d-muted" style={{ marginTop: "2mm" }}>Reads one clip on the phone, confirms the shot before it grades it, and answers in a few plain sentences: what was good, what to fix, one cue, one drill. The evidence is one tap away.</p>
          </div>
          <div className="d-box">
            <h3>What it refuses to do</h3>
            <p className="d-muted" style={{ marginTop: "2mm" }}>Guess. Another shot is named and not graded; an unclear clip gets the reason and what to change. It makes no medical claim.</p>
          </div>
        </div>
        <table style={{ marginTop: "8mm" }}>
          <thead><tr><th style={{ width: "22%" }}>For</th><th style={{ width: "39%" }}>They want</th><th>Aline gives them</th></tr></thead>
          <tbody>
            <tr><td><strong>A batter</strong></td><td className="d-muted">To know if the defence was right, and the one thing to practise.</td><td className="d-muted">A result in a minute, a drill ladder, every shot kept, change over time.</td></tr>
            <tr><td><strong>A coach</strong></td><td className="d-muted">To see players&apos; shots between sessions and steer the work.</td><td className="d-muted">A review queue, their own view beside Aline&apos;s, drills with a date, a record.</td></tr>
            <tr><td><strong>A parent</strong></td><td className="d-muted">To know what is filmed, kept and shared.</td><td className="d-muted">Video that stays on the phone; their agreement before a child shares with a coach.</td></tr>
          </tbody>
        </table>
        <Foot label="What it is" page={2} />
      </section>

      {/* 3 · Principles and look */}
      <section className="slide">
        <h2>The rules every screen follows</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: "10mm", marginTop: "6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm 7mm", alignContent: "start" }}>
            {PRINCIPLES.map(([t, d]) => (
              <div key={t}>
                <h3>{t}</h3>
                <p className="d-muted" style={{ marginTop: "1mm" }}>{d}</p>
              </div>
            ))}
          </div>
          <div className="d-box">
            <h3>The look</h3>
            <div style={{ display: "flex", gap: "2mm", marginTop: "3mm" }}>
              {[["#050505", "Field"], ["#121212", "Ground"], ["#f4f1e8", "Chalk"], ["#ff6a00", "The line"]].map(([hex, name]) => (
                <div key={hex} style={{ flex: 1 }}>
                  <div style={{ height: "11mm", background: hex, borderRadius: "2mm", border: "0.2mm solid #8a877f" }} />
                  <p style={{ fontSize: "7.5pt", marginTop: "1mm" }}>{name}</p>
                  <p className="d-subtle" style={{ fontSize: "7pt" }}>{hex}</p>
                </div>
              ))}
            </div>
            <ul className="d-list d-muted" style={{ marginTop: "4mm" }}>
              <li>A dark field, warm white text and one orange. Orange is the line, the moment in view and the main action; never a surface.</li>
              <li>A daylight theme for sunshine and for paper.</li>
              <li>Archivo for headlines, Geist for text. Sentence case, pill buttons, rounded panels, plain numbers.</li>
              <li>No gradients, shadows, blur or glass. Every control 44 px or more. A state always has a word or a mark, not colour alone.</li>
              <li>Movement shows a still first and draws nothing off-screen, when idle, or under reduced motion.</li>
            </ul>
          </div>
        </div>
        <Foot label="Principles" page={3} />
      </section>

      {/* 4 · The map */}
      <section className="slide">
        <h2>The map: {FLOWS.length} flows</h2>
        <div style={{ marginTop: "5mm", display: "grid", gap: "2.6mm" }}>
          {FLOWS.map((flow, f) => (
            <div key={flow.id} style={{ display: "grid", gridTemplateColumns: "52mm 1fr", gap: "4mm", alignItems: "center" }}>
              <div>
                <p style={{ fontWeight: 600 }}>{f + 1}. {flow.name}</p>
                <p className="d-subtle" style={{ fontSize: "7.5pt" }}>{flow.who}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {flow.steps.map((id, i) => (
                  <div key={id} style={{ display: "flex", alignItems: "center", flex: i === flow.steps.length - 1 ? "none" : 1, minWidth: 0 }}>
                    <span style={{ border: "0.4mm solid var(--d-line)", borderRadius: "5mm", padding: "0.8mm 2.4mm", fontSize: "7.6pt", whiteSpace: "nowrap", background: "var(--d-paper)" }}>{screenById(id)!.name}</span>
                    {i < flow.steps.length - 1 && <span className="d-rail" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Foot label="The map" page={4} />
      </section>

      {/* Flows */}
      {flowSlides.map(({ flow, f, ids, part, parts }, slide) => {
        const offset = slidesOf(flow).slice(0, part).reduce((n, s) => n + s.length, 0);
        return (
          <section key={`${flow.id}-${part}`} className="slide">
            <div style={{ display: "flex", alignItems: "baseline", gap: "5mm" }}>
              <h2>{f + 1}. {flow.name}</h2>
              <p className="d-subtle">{flow.who}{parts > 1 ? ` · part ${part + 1} of ${parts}` : ""}</p>
            </div>
            <p className="d-muted" style={{ marginTop: "1.5mm", maxWidth: "200mm" }}>{flow.goal}</p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(ids.length, 4)}, 1fr)`, gap: "0 5mm", marginTop: "5mm" }}>
              {ids.map((id, i) => {
                const s = screenById(id)!;
                const n = offset + i + 1;
                const last = n === flow.steps.length;
                return (
                  <div key={id} style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: "2.5mm" }}>
                      <span className="d-joint">{n}</span>
                      {!last && <span className="d-rail" style={{ marginRight: "-5mm" }} />}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="d-phone" style={{ width: "43mm" }} src={screenImage(id)} alt="" width={SCREEN_SIZE.width} height={SCREEN_SIZE.height} />
                    <h3 style={{ marginTop: "2.5mm" }}>{s.name}</h3>
                    <p className="d-muted" style={{ fontSize: "8pt", marginTop: "0.8mm" }}>{s.says}</p>
                    <ul className="d-list d-subtle" style={{ fontSize: "7.4pt", marginTop: "1.5mm" }}>
                      {s.options.slice(0, 3).map(([label, does]) => (
                        <li key={label}><strong style={{ color: "var(--d-ink)", fontWeight: 600 }}>{label}:</strong> {does}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            {flow.note && part === parts - 1 && <p className="d-subtle" style={{ fontSize: "8pt", marginTop: "3mm" }}>Note: {flow.note}</p>}
            <Foot label={flow.name} page={FRONT + slide + 1} />
          </section>
        );
      })}

      {/* How an analysis runs */}
      <section className="slide">
        <h2>How an answer is made</h2>
        <p className="d-muted" style={{ marginTop: "1.5mm", maxWidth: "210mm" }}>Everything below happens on the phone, in about a minute. The order never changes: the recording, then the shot, then the grade.</p>
        <div style={{ display: "flex", alignItems: "stretch", marginTop: "7mm" }}>
          {PIPELINE.map(([t, d], i) => (
            <div key={t} style={{ flex: 1, minWidth: 0, paddingRight: "4mm" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: "2.5mm" }}>
                <span className="d-joint">{i + 1}</span>
                {i < PIPELINE.length - 1 && <span className="d-rail" style={{ marginRight: "-4mm" }} />}
              </div>
              <h3>{t}</h3>
              <p className="d-muted" style={{ fontSize: "8.4pt", marginTop: "1mm" }}>{d}</p>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6mm", marginTop: "9mm" }}>
          <div className="d-box">
            <h3>One answer, four readings</h3>
            <p className="d-muted" style={{ marginTop: "2mm" }}>The stored result is the same whatever the level. The report then picks what to list for the level and focus; a comparison is made only when two shots can fairly be compared.</p>
          </div>
          <div className="d-box">
            <h3>Every number has a reason</h3>
            <p className="d-muted" style={{ marginTop: "2mm" }}>Each threshold and range lives in one registry with why it has that value. Changing one changes the registry&apos;s fingerprint, which is published.</p>
          </div>
          <div className="d-box">
            <h3>No fix for one clip</h3>
            <p className="d-muted" style={{ marginTop: "2mm" }}>The same movement recorded another way (mirrored, resized, another frame rate) must get the same answer. A change that breaks that does not ship.</p>
          </div>
        </div>
        <Foot label="The engine" page={FRONT + flowSlides.length + 1} />
      </section>

      {/* Data */}
      <section className="slide">
        <h2>What is kept, and where</h2>
        <table style={{ marginTop: "6mm" }}>
          <thead><tr><th style={{ width: "30%" }}>Data</th><th style={{ width: "32%" }}>What it is</th><th>Where it lives</th></tr></thead>
          <tbody>
            {DATA.map(([a, b, c]) => (
              <tr key={a}><td><strong>{a}</strong></td><td className="d-muted">{b}</td><td className="d-muted">{c}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6mm", marginTop: "8mm" }}>
          <div className="d-box"><h3>Sharing is a choice</h3><p className="d-muted" style={{ marginTop: "2mm" }}>Saving to an account and sharing with a coach are separate switches, both off until turned on, both reversible.</p></div>
          <div className="d-box"><h3>Under 18</h3><p className="d-muted" style={{ marginTop: "2mm" }}>A coach can&apos;t be linked, and sees nothing, until a parent&apos;s or guardian&apos;s agreement is recorded. Withdrawing it hides the reports at once.</p></div>
          <div className="d-box"><h3>A coach never edits the result</h3><p className="d-muted" style={{ marginTop: "2mm" }}>The database gives a coach no way to change an analysis. Their view is stored beside it, labelled as theirs.</p></div>
        </div>
        <Foot label="Data and privacy" page={FRONT + flowSlides.length + 2} />
      </section>

      {/* True today */}
      <section className="slide">
        <h2>What is true today</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "7mm", marginTop: "6mm" }}>
          <div>
            <h3 className="d-accent">Built and live</h3>
            <ul className="d-list d-muted" style={{ marginTop: "2mm" }}>
              <li>Front-foot and back-foot defence graded, from video or photos, side-on or from the bowler&apos;s end.</li>
              <li>Aline names the shot itself; other shots are named and not graded.</li>
              <li>The report in a summary and five sections, on screen and on paper.</li>
              <li>Three levels and eight focus areas.</li>
              <li>Movement similarity with where every reference comes from.</li>
              <li>Coach workspace with squads, drills, history and export.</li>
              <li>Two phones paired for one ball.</li>
              <li>Your own shot model: joints placed on a figure, exported as text, and reports set against it.</li>
            </ul>
          </div>
          <div>
            <h3 className="d-accent">Not yet proven</h3>
            <ul className="d-list d-muted" style={{ marginTop: "2mm" }}>
              <li>The engine is consistent on generated movement; it is not yet validated on many real athletes.</li>
              <li>Ranges are provisional coaching ranges, not norms fitted to players.</li>
              <li>Two real phones over the live connection; the camera line-up and Save as PDF on a real phone.</li>
              <li>Safari, Firefox and a screen reader&apos;s speech.</li>
            </ul>
          </div>
          <div>
            <h3 className="d-accent">What it needs next</h3>
            <ul className="d-list d-muted" style={{ marginTop: "2mm" }}>
              <li>20 to 30 labelled real clips from three or more batters: unlocks a steadier contact moment, body measurements in the measures, and ranges fitted to players.</li>
              <li>A first player&apos;s signed permission and a usable recording, for the library.</li>
              <li>Legal advice on a parent&apos;s agreement in the markets served.</li>
            </ul>
          </div>
        </div>
        <Foot label="Today" page={FRONT + flowSlides.length + 3} />
      </section>
    </main>
  );
}
