import Link from "next/link";
import { BFD_BANDS } from "@/engine/backfoot-defs";

// The back-foot defence (docs/11-back-foot-defence.md): what the shot is, with the coaching
// sources it comes from, what Aline measures and how to film it.

export const BFD_SOURCES = [
  { name: "Sportplan · Back foot defence", href: "https://www.sportplan.net/drills/Cricket/Back-foot-batting/Back-Foot-Defence.jsp" },
  { name: "Sportplan · Defensive back stroke", href: "https://www.sportplan.net/drills/Cricket/Techniques/U12/Defensive-Back-stroke-XStraightBack2.jsp" },
  { name: "ESPNcricinfo coaching · Backfoot defence", href: "https://i.imgci.com/link_to_database/INTERACTIVE/COACHING/BATTING/BACKFOOT_DEFENCE.html" },
  { name: "Pitchero cricket academy · Backfoot defence", href: "https://www.pitchero.com/en_US/coaching/cricket/batting/training/backfoot-defence" },
];

export const BFD_PARTS: Array<[string, string]> = [
  ["Back foot", "Moves back and across toward the stumps, inside the line of the ball, roughly parallel to the crease so you stay side-on. It moves first."],
  ["Front foot", "Follows, sliding back until it is alongside the back foot."],
  ["Weight and head", "Weight on the back foot, but the head stays forward, still, eyes level, over the line of the ball."],
  ["Body", "Tall and side-on to the bowler: don't sink under the ball."],
  ["Front elbow and bat", "Front elbow high; the full face of the bat straight down the pitch, handle ahead of the blade."],
  ["Contact", "Under the eyes, close to the body: look through your hands at the ball."],
  ["Hands", "Soft: the grip relaxes so the bat gives. No follow-through; hold the position."],
];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const band = ([lo, hi]: readonly [number, number]) => `${pct(lo)} to ${pct(hi)}`;

export function BackFootGuide() {
  const rows: Array<[string, string, string]> = [
    ["Back foot back", "How far it travelled toward the stumps (side-on only)", band(BFD_BANDS.backStep)],
    ["Front foot alongside", "Gap between the ankles at contact (side-on only)", `up to ${pct(BFD_BANDS.feetGap[1])}`],
    ["Head forward", "Head ahead of the back ankle; from the bowler's end, over the line", `${band(BFD_BANDS.head.forward)} · ${band(BFD_BANDS.head.sideways)}`],
    ["Standing tall", "How much the head dropped from the stance", `up to ${pct(BFD_BANDS.headDrop[1])}`],
    ["Front elbow high", "Front elbow against the front shoulder", band(BFD_BANDS.elbow)],
    ["Contact under the eyes", "Hands against the head at contact", `${band(BFD_BANDS.handsEyes.forward)} · ${band(BFD_BANDS.handsEyes.sideways)}`],
    ["Soft hands", "How far the hands travel in the 250 ms after contact", `up to ${pct(BFD_BANDS.deadBat[1])}`],
    ["Back foot first", "The back foot sets before the front foot", `0–${BFD_BANDS.backFirstMs[1]} ms`],
    ["Set before the ball", "Feet and head settled by contact (contact seen)", "at or before contact"],
  ];
  return (
    <section id="back-foot" aria-labelledby="back-foot-h" className="mt-6 scroll-mt-24 border-t border-line pt-10 space-y-6">
      <div className="max-w-3xl">
        <p className="eyebrow">Second shot</p>
        <h2 id="back-foot-h" className="display mt-2 text-3xl sm:text-5xl">The back-foot defence</h2>
        <p className="mt-3 text-fg-muted">
          Played to a ball <strong className="text-fg">short of a length, on the stumps, rising</strong>: too short to get forward to, too straight to leave.
          The aim is to block it safely. Pick “Back-foot defence” on the Analyse screen; everything else works the same way as the front-foot defence.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/analyse?shot=back" className="btn btn-primary">Analyse back-foot defence</Link>
          <Link href="/sample/valid_bfd" className="btn btn-ghost">See a sample report</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <p className="font-semibold">The shot, part by part</p>
          <dl className="mt-3 space-y-2.5 text-sm">
            {BFD_PARTS.map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="text-fg-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-fg-subtle">
            Sources:{" "}
            {BFD_SOURCES.map((s, i) => (
              <span key={s.href}>
                <a className="underline" href={s.href} rel="noopener noreferrer" target="_blank">{s.name}</a>
                {i < BFD_SOURCES.length - 1 ? "; " : "."}
              </span>
            ))}
          </p>
        </div>

        <div className="card overflow-hidden">
          <p className="px-5 pt-5 font-semibold">What Aline measures</p>
          <p className="px-5 pt-1 text-xs text-fg-subtle">× your height, from the back foot. Side-on range · from the bowler&apos;s end.</p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {rows.map(([k, d, r]) => (
              <li key={k} className="flex items-baseline justify-between gap-3 px-5 py-2">
                <span>
                  <span className="font-medium">{k}</span>
                  <span className="block text-xs text-fg-subtle">{d}</span>
                </span>
                <span className="num shrink-0 text-xs text-fg-muted">{r}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-fg-subtle">
            Every range is provisional coaching geometry from the sources: no published lab measurements of this shot were found. Each one is labelled that
            way in your report.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5 text-sm">
          <p className="font-semibold">Film it</p>
          <ul className="mt-2 space-y-1.5 text-fg-muted">
            <li>Side-on, hip height, 6–8 m away: going back and the front foot coming alongside are only visible from side-on.</li>
            <li>From the bowler&apos;s end works too: the head, elbow, hands and timing are checked, the footwork isn&apos;t.</li>
            <li>Ask for short balls on the stumps (throw-downs or a bowling machine). One shot per clip works best.</li>
            <li>Photos: one side-on photo at contact is checked on the position (front foot alongside, head, height, elbow, hands).</li>
          </ul>
        </div>
        <div className="card p-5 text-sm">
          <p className="font-semibold">How it is identified</p>
          <ul className="mt-2 space-y-1.5 text-fg-muted">
            <li>Accepted only when the movement clearly reads as a back-foot defence (80% or more, with a clear margin over every other shot).</li>
            <li>You must have gone back and stayed tall. A step forward, or the head going down into a stride, is a front-foot shot.</li>
            <li>A front-foot defence, pull or cut is named for what it is, never scored as a back-foot defence. A front-foot defence can be re-checked with one tap.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
