"use client";
// The landing page's picture of what Align means: the textbook defence just after contact,
// the ball dropping dead under the eyes, with the one line the shot is built on drawn
// behind the batter: eyes, front knee and ball, one above the other. A still drawing (no
// clock, no WebGL), so it costs a phone nothing to show.

import { Ball, BatterFigure, FigureDefs, GOOD, ZONE, type FigurePose, type Pt } from "@/components/lesson/figure";
import { Draw, Label, seg } from "@/components/lesson/lesson";

export function AlignHero({ pose, ballFrom }: { pose: FigurePose; ballFrom?: Pt }) {
  const eye: Pt = [pose.head[0] + 4.4, pose.head[1] + 0.6];
  const ball: Pt = pose.ball ?? [pose.fk[0], 86];
  const knee = pose.fk;
  const x = (pose.head[0] + knee[0] + ball[0]) / 3;
  const top = pose.head[1] - 15;
  const tag = x + 19;
  const [x0, x1] = [Math.min(pose.ba[0], pose.btoe[0]) - 10, tag + 30];
  const [y0, y1] = [top - 9, 108];
  const marks: Array<[Pt, number, string]> = [
    [eye, eye[0] + 4.5, "eyes"],
    [knee, knee[0] + 6, "front knee"],
    [ball, ball[0] + 3.5, "ball"],
  ];
  return (
    <svg
      viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
      className="paper-grain block h-auto w-full"
      role="img"
      aria-label="A batter playing a forward defence, the ball dropping dead at the front foot. Eyes, front knee and ball sit on one upright line."
    >
      <FigureDefs id="hero" />
      <ellipse cx={(pose.fa[0] + pose.ba[0]) / 2} cy={101.6} rx={Math.abs(pose.fa[0] - pose.ba[0]) / 2 + 10} ry={2} fill="var(--ill-ink)" opacity={0.08} />
      <path d={`M${x0 + 3} 101.2 Q ${(x0 + x1) / 2} 100.4 ${x1 - 3} 101.4`} stroke="var(--ill-chalk)" strokeWidth={0.7} fill="none" opacity={0.55} />
      {/* the line, behind the batter: it shows above the helmet and down to the ground */}
      <Draw d={seg([x, top], [x, 104])} color={ZONE} w={1.6} dash="2.4 1.9" delay={0.2} />
      <BatterFigure p={pose} id="hero" />
      <Ball at={ball} from={ballFrom} />
      <Label at={[x, top - 3]} text="one line" color={GOOD} delay={0.9} />
      {marks.map(([at, from, text], i) => (
        <g key={text}>
          <Draw d={seg([from, at[1]], [tag - 1.5, at[1]])} color={GOOD} w={0.9} delay={1 + i * 0.25} />
          <Label at={[tag, at[1] + 2.4]} text={text} color={GOOD} anchor="start" delay={1.15 + i * 0.25} />
        </g>
      ))}
    </svg>
  );
}
