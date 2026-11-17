"use client";
// The shot-model editor (/models/edit): place each joint for the moments that matter, read the
// measures the pose gives as it changes, say why it is right, save it, and take it away as text.

import { Hold } from "@/components/common/hold";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FEATURES, HANDLE_LABEL, MOMENTS, SEGMENT_LABEL, STRICTNESS,
  dragHandle, ground, handlePoint, handlesOf, measuresOf, modelToText, pelvisOf, placeBat, planesOf, segments, valueInWords, withSegments, withoutBat,
  type Handle, type MomentId, type Pose, type PoseModel, type Segments, type V3,
} from "@/engine/pose-model";
import { chooseModel, chosenModelId, saveModel, starterBat, starterPose } from "@/lib/pose-models";
import { DeleteModel } from "./delete-model";
import { figureFile, type TracedFigure } from "@/lib/traced-figure";
import { loadProfile } from "@/lib/store";
import { Download } from "../icons";
import { PoseCanvas, VIEWS, type View } from "./pose-canvas";

const SHOT_LABEL = { front_foot_defence: "Front-foot defence", back_foot_defence: "Back-foot defence" } as const;
const AXIS = [
  { i: 0, label: "Forward", says: "toward the bowler" },
  { i: 1, label: "Up", says: "above the ground" },
  { i: 2, label: "Across", says: "toward the off side" },
] as const;

type ViewKey = "side" | "front" | "round";

/** A length in the person's units: centimetres when their height is known, else a share of it. */
function useUnits(heightCm: number | null) {
  return useMemo(() => {
    const cm = heightCm !== null;
    return {
      cm,
      unit: cm ? "cm" : "% of height",
      show: (v: number) => (cm ? Math.round(v * heightCm! * 10) / 10 : Math.round(v * 1000) / 10),
      read: (n: number) => (cm ? n / heightCm! : n / 100),
      step: cm ? 0.5 : 0.3,
    };
  }, [heightCm]);
}

export function ModelEditor({ initial }: { initial: PoseModel }) {
  const router = useRouter();
  const [model, setModel] = useState(initial);
  const [moment, setMoment] = useState<MomentId>("contact");
  const angles = planesOf(model.angles);
  const [viewKey, setViewKey] = useState<ViewKey>(angles.includes("side") ? "side" : "front");
  const [view, setView] = useState<View>(VIEWS[angles.includes("side") ? "side" : "front"]);
  const [selected, setSelected] = useState<Handle | null>("pelvis");
  const [saved, setSaved] = useState(true);
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uses, setUses] = useState(() => chosenModelId() === initial.id);
  const undo = useRef<PoseModel["moments"][]>([]);
  const [undoable, setUndoable] = useState(0);
  const before = useRef<PoseModel["moments"] | null>(null);
  const units = useUnits(model.heightCm);
  // The traced batter for each view this model is placed in (a right-hander's clips only), fetched once.
  const [figures, setFigures] = useState<Partial<Record<"side" | "front", TracedFigure>>>({});
  useEffect(() => {
    let live = true;
    for (const plane of planesOf(initial.angles)) {
      const file = figureFile(initial.shot, plane, initial.battingSide);
      if (!file) continue;
      fetch(file)
        .then((r) => (r.ok ? (r.json() as Promise<TracedFigure>) : null))
        .then((f) => f && live && setFigures((was) => ({ ...was, [plane]: f })))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [initial.angles, initial.shot, initial.battingSide]);
  const plane: "side" | "front" | null = viewKey === "side" ? "side" : viewKey === "front" ? "front" : null;
  const traced = plane ? figures[plane]?.moments[moment] : undefined;
  const drawing = useMemo(() => (plane && traced ? { moment: traced, plane } : null), [plane, traced]);

  const pose = model.moments[moment] ?? model.moments.contact;
  const has = !!model.moments[moment];
  const hasBat = !!model.moments.contact.bat_toe;
  /** A new moment's pose, holding a bat when the model has one. */
  const start = (p: Pose, id: MomentId) => (hasBat && !p.bat_toe ? placeBat(p, starterBat(model.shot, id)) : p);
  const toggleBat = () => {
    remember(model.moments);
    const next = Object.fromEntries(
      Object.entries(model.moments).map(([id, p]) => [id, hasBat ? withoutBat(p as Pose) : placeBat(p as Pose, starterBat(model.shot, id as MomentId))]),
    ) as PoseModel["moments"];
    change({ moments: next });
    if (hasBat && selected === "bat_toe") setSelected(null);
    if (!hasBat) setSelected("bat_toe");
  };
  const centre = useMemo(() => {
    const c = pelvisOf(model.moments.contact);
    return [c[0], c[2]] as const;
    // The picture stays put while a joint is dragged: only another model's contact pose moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);

  const change = (patch: Partial<PoseModel>) => {
    setModel((m) => ({ ...m, ...patch }));
    setSaved(false);
  };
  const remember = (was: PoseModel["moments"]) => {
    undo.current = [...undo.current.slice(-29), was];
    setUndoable(undo.current.length);
  };
  const setPose = (next: Pose, record = true) => {
    if (record) remember(model.moments);
    change({ moments: { ...model.moments, [moment]: next } });
  };
  const onDrag = (h: Handle, target: V3) => {
    if (!before.current) before.current = model.moments;
    const from = before.current[moment] ?? before.current.contact;
    setModel((m) => ({ ...m, moments: { ...m.moments, [moment]: dragHandle(from, h, target) } }));
    setSaved(false);
  };
  const onDragEnd = () => {
    if (before.current) remember(before.current);
    before.current = null;
  };

  const pickView = (k: ViewKey) => {
    setViewKey(k);
    setView(VIEWS[k]);
  };
  const point = selected ? handlePoint(pose, selected) : null;
  const nudge = (axis: 0 | 1 | 2, value: number) => {
    if (!selected || !point || !Number.isFinite(value)) return;
    const t: [number, number, number] = [point[0], point[1], point[2]];
    t[axis] = units.read(value);
    setPose(dragHandle(pose, selected, t));
  };

  const measures = measuresOf(pose, model.angles);
  const seg = segments(model.moments.contact);
  const profile = typeof window === "undefined" ? null : loadProfile();
  const body = profile?.body;
  const mine: Partial<Segments> | null =
    profile?.heightCm && body && (body.upperArmCm || body.forearmCm || body.shoulderWidthCm || body.legLengthCm)
      ? {
          ...(body.upperArmCm ? { upperArm: body.upperArmCm / profile.heightCm } : {}),
          ...(body.forearmCm ? { forearm: body.forearmCm / profile.heightCm } : {}),
          ...(body.shoulderWidthCm ? { shoulderWidth: body.shoulderWidthCm / profile.heightCm } : {}),
          // Leg length is hip to floor: the thigh and shin share it as they do now, less the ankle's height.
          ...(body.legLengthCm
            ? (() => {
                const leg = Math.max(body.legLengthCm / profile.heightCm - 0.04, 0.3);
                const k = leg / (seg.thigh + seg.shin);
                return { thigh: seg.thigh * k, shin: seg.shin * k };
              })()
            : {}),
        }
      : null;

  const save = () => {
    const s = saveModel(model);
    setModel(s);
    setSaved(true);
  };
  const strict = STRICTNESS.find((s) => s.angleDeg === model.tolerance.angleDeg && s.offset === model.tolerance.offset)?.id ?? null;
  const fileName = `${model.name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "shot-model"}.json`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-fg-subtle">
        <Link href="/models" className="inline-flex min-h-11 items-center hover:text-fg">Shot models</Link>
        <span aria-hidden>/</span>
        <span className="text-fg-muted">{model.name}</span>
      </p>

      <header className="space-y-3">
        <h1 className="sr-only">Shot model: {model.name}</h1>
        <label className="block">
          <span className="sr-only">Model name</span>
          <input className="display min-h-11 w-full border-b border-line bg-transparent pb-1 text-3xl outline-none focus:border-brand sm:text-4xl" value={model.name} maxLength={80} onChange={(e) => change({ name: e.target.value })} />
        </label>
        <p className="text-fg-muted">
          {SHOT_LABEL[model.shot]}, {model.battingSide}-handed, placed from {model.angles === "both" ? "the side and the front" : model.angles === "side" ? "the side only" : "the front only"}.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <section aria-label="The figure" className="min-w-0 space-y-3">
          <div role="tablist" aria-label="Moment" className="flex flex-wrap gap-2">
            {[...MOMENTS].reverse().map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={moment === m.id} onClick={() => setMoment(m.id)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${moment === m.id ? "border-brand bg-brand-soft text-fg" : "border-line-strong text-fg-muted"}`}>
                {m.label}{model.moments[m.id] ? "" : " (not placed)"}
              </button>
            ))}
          </div>

          <div className="panel overflow-hidden">
            {has ? (
              <PoseCanvas
                pose={pose}
                side={model.battingSide}
                view={view}
                centre={centre}
                selected={selected}
                onSelect={setSelected}
                onDrag={onDrag}
                onDragEnd={onDragEnd}
                onOrbit={model.angles === "both" ? (v) => { setView(v); setViewKey("round"); } : undefined}
                ghost={moment === "contact" ? null : model.moments.contact}
                drawing={drawing}
                label={`${MOMENTS.find((m) => m.id === moment)!.label}: the figure. Drag a joint to place it.`}
              />
            ) : (
              <div className="space-y-3 p-5">
                <p className="text-fg-muted">This moment isn&apos;t in your model yet. A model needs contact; the other moments are optional and are checked only when placed.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setPose(start(starterPose(model.shot, moment), moment))}>Start from the traced batter</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setPose(model.moments.contact)}>Start from your contact pose</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="View" className="flex gap-2">
              {(["side", "front", "round"] as const)
                .filter((k) => (k === "round" ? model.angles === "both" : angles.includes(k)))
                .map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={viewKey === k} onClick={() => pickView(k)}
                    className={`min-h-11 rounded-full border px-4 text-sm ${viewKey === k ? "border-fg text-fg" : "border-line-strong text-fg-muted"}`}>
                    {k === "side" ? "Side" : k === "front" ? "Front" : "3D"}
                  </button>
                ))}
            </div>
            <button type="button" role="switch" aria-checked={hasBat} onClick={toggleBat}
              className={`min-h-11 rounded-full border px-4 text-sm ${hasBat ? "border-fg text-fg" : "border-line-strong text-fg-muted"}`}>
              {hasBat ? "Bat: on" : "Add a bat"}
            </button>
            <button type="button" className="btn btn-quiet ml-auto" disabled={!undoable}
              onClick={() => {
                const was = undo.current.pop();
                setUndoable(undo.current.length);
                if (was) change({ moments: was });
              }}>
              Undo
            </button>
          </div>
          <p className="text-sm text-fg-muted">
            {drawing
              ? "Traced from a real batter's clip. It bends as you move the joints."
              : model.battingSide === "left"
                ? "Joints only: a left-hander needs a left-hander's clip to be traced, never a mirrored one."
                : !plane
                  ? "Joints only in 3D. The drawing shows from the side or the front."
                  : has
                    ? "Joints only: no clip of this moment from here has been traced yet."
                    : ""}
          </p>
          <p className="text-sm text-fg-subtle">
            <Hold
              more={
                <>
                  <p>
                    {model.angles === "both"
                      ? "From the side a joint moves along the pitch and up; from the front, across and up. In 3D, drag the background to turn the figure."
                      : `This model is placed from the ${model.angles} only, so it is checked only against clips filmed from there.`}{" "}
                    Bones keep their length. {moment !== "contact" && has ? "The dotted figure is your contact pose." : ""}
                  </p>
                  <p className="mt-2">
                    The bat is optional. It stays in both hands: move a hand and the bat goes with it; drag its toe to set its angle. It is checked only on clips where the bat was tracked (marked, or found).
                  </p>
                </>
              }
            >
              {hasBat ? "Drag a joint, or the bat's toe" : "Drag a joint to place it"}
            </Hold>
          </p>
          {has && moment !== "contact" && (
            <button type="button" className="btn btn-quiet"
              onClick={() => {
                remember(model.moments);
                const rest = { ...model.moments };
                delete rest[moment];
                change({ moments: rest as PoseModel["moments"] });
              }}>
              Remove this moment
            </button>
          )}
        </section>

        <div className="min-w-0 space-y-5">
          {has && (
            <section aria-labelledby="joint-h" className="panel p-5">
              <h2 id="joint-h" className="font-semibold">Joint</h2>
              <label className="mt-3 block text-sm">
                <span className="sr-only">Which joint</span>
                <select className="field" value={selected ?? ""} onChange={(e) => setSelected((e.target.value || null) as Handle | null)}>
                  <option value="">Tap a joint, or choose one</option>
                  {handlesOf(pose).map((h) => <option key={h} value={h}>{HANDLE_LABEL[h]}</option>)}
                </select>
              </label>
              {point && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {AXIS.filter((a) => (a.i === 0 ? model.angles !== "front" : a.i === 2 ? model.angles !== "side" : true)).map((a) => (
                    <label key={a.label} className="text-sm">
                      <span className="text-fg-muted">{a.label} ({units.unit === "cm" ? "cm" : "%"})</span>
                      <input className="field num mt-1" type="number" inputMode="decimal" step={units.step} value={units.show(point[a.i])} onChange={(e) => nudge(a.i, Number(e.target.value))} />
                      <span className="mt-1 block text-xs text-fg-subtle">{a.says}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-fg-subtle">
                Measured from the ground under where the hips began at contact{units.cm ? "" : ", as a share of the batter's height (add a height below for centimetres)"}. Typing a number moves the joint as far as its bones allow.
              </p>
            </section>
          )}

          <section aria-labelledby="measures-h" className="panel p-5">
            <h2 id="measures-h" className="font-semibold">What this pose measures</h2>
            <p className="mt-1 text-sm text-fg-muted">These are the numbers a clip is set against, at this moment. They change as you move a joint.</p>
            {angles.map((plane) => (
              <div key={plane} className="mt-4">
                <h3 className="text-sm text-fg-subtle">{plane === "side" ? "From the side" : "From the bowler's end"}</h3>
                <dl className="mt-1 divide-y divide-line">
                  {measures.filter((m) => m.plane === plane).map((m) => (
                    <div key={m.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                      <dt className="text-fg-muted">{m.label}</dt>
                      <dd className="num shrink-0 font-medium">{m.value === null ? "—" : valueInWords(m, m.value, model.heightCm)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>

          <section aria-labelledby="why-h" className="panel p-5">
            <h2 id="why-h" className="font-semibold">Why this is right</h2>
            <label className="mt-2 block">
              <span className="sr-only">Why this is right</span>
              <textarea className="field min-h-28" maxLength={2000} placeholder="In your own words: what each part of the body is doing and why. Saved with the model and written into its text."
                value={model.note} onChange={(e) => change({ note: e.target.value })} />
            </label>
          </section>

          <section aria-labelledby="strict-h" className="panel p-5">
            <h2 id="strict-h" className="font-semibold">How close a clip must be</h2>
            <div role="radiogroup" aria-labelledby="strict-h" className="mt-3 flex flex-wrap gap-2">
              {STRICTNESS.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={strict === s.id} onClick={() => change({ tolerance: { angleDeg: s.angleDeg, offset: s.offset } })}
                  className={`min-h-11 rounded-full border px-4 text-sm ${strict === s.id ? "border-brand bg-brand-soft text-fg" : "border-line-strong text-fg-muted"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              A check matches within {model.tolerance.angleDeg}° for an angle and {units.cm ? `${units.show(model.tolerance.offset)} cm` : `${Math.round(model.tolerance.offset * 100)}% of the batter's height`} for a distance. Your choice, saved with the model; any other value can be set in its text.
            </p>
          </section>

          <details className="panel group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 font-semibold">
              <span>The figure&apos;s size</span>
              <span className="text-fg-subtle" aria-hidden>+</span>
            </summary>
            <div className="space-y-3 border-t border-line p-5">
              <label className="block max-w-[12rem] text-sm">
                <span className="text-fg-muted">Batter&apos;s height (cm, optional)</span>
                <input className="field num mt-1" type="number" inputMode="numeric" min={90} max={230} value={model.heightCm ?? ""} placeholder="Not given"
                  onChange={(e) => change({ heightCm: e.target.value && Number(e.target.value) >= 90 && Number(e.target.value) <= 230 ? Number(e.target.value) : null })} />
              </label>
              <dl className="divide-y divide-line">
                {(Object.keys(seg) as Array<keyof Segments>).map((k) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                    <dt className="text-fg-muted">{SEGMENT_LABEL[k]}</dt>
                    <dd className="num font-medium">{units.cm ? `${units.show(seg[k])} cm` : `${Math.round(seg[k] * 1000) / 10}%`}</dd>
                  </div>
                ))}
              </dl>
              {mine ? (
                <button type="button" className="btn btn-ghost"
                  onClick={() => {
                    remember(model.moments);
                    const next = Object.fromEntries(Object.entries(model.moments).map(([id, p]) => [id, withSegments(p as Pose, mine)])) as PoseModel["moments"];
                    change({ moments: next, heightCm: model.heightCm ?? profile?.heightCm ?? null });
                  }}>
                  Use my measurements from Profile
                </button>
              ) : (
                <p className="text-sm text-fg-subtle">
                  The figure has standard proportions. Give your arm and leg lengths in <Link href="/profile" className="inline-flex min-h-11 items-center underline underline-offset-4">Profile</Link> to give it yours.
                </p>
              )}
              <button type="button" className="btn btn-quiet" onClick={() => setPose(start(ground(starterPose(model.shot, moment)), moment))}>Reset to the traced batter</button>
            </div>
          </details>

          <section aria-label="Save and use" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" onClick={save} disabled={saved}>{saved ? "Saved" : "Save model"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setText(modelToText(model)); setCopied(false); }}>Export as text</button>
              <DeleteModel id={model.id} name={model.name} onDeleted={() => router.push("/models")} />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" checked={uses}
                onChange={(e) => {
                  if (e.target.checked) saveModel(model);
                  chooseModel(e.target.checked ? model.id : null);
                  setUses(e.target.checked);
                  if (e.target.checked) setSaved(true);
                }} />
              <span>
                <span className="font-medium">Check my shots against this model</span>
                <span className="block text-fg-muted">Aline still decides which shot was played. When it confirms a {SHOT_LABEL[model.shot].toLowerCase()}, the report is set against this model instead of Aline&apos;s own ranges. Untick to go back.</span>
              </span>
            </label>
            <p className="text-sm text-fg-subtle" role="status">{saved ? "Kept on this device." : "Not saved yet."}</p>
          </section>

          {text !== null && (
            <section aria-labelledby="text-h" className="panel p-5">
              <h2 id="text-h" className="font-semibold">This model as text</h2>
              <p className="mt-1 text-sm text-fg-muted">Every joint at every moment, in body heights, with the measures and lengths they give. Paste it back under &quot;Import from text&quot; to rebuild the model anywhere.</p>
              <textarea className="field num mt-3 h-64 text-xs" readOnly value={text} aria-label="The model as text" onFocus={(e) => e.currentTarget.select()} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(text).catch(() => null);
                    setCopied(true);
                  }}>
                  {copied ? "Copied" : "Copy"}
                </button>
                <a className="btn btn-ghost" download={fileName} href={`data:application/json;charset=utf-8,${encodeURIComponent(text)}`}>
                  <Download size={16} /> Download
                </a>
                <button type="button" className="btn btn-quiet" onClick={() => setText(null)}>Close</button>
              </div>
              <p className="mt-2 text-xs text-fg-subtle">{FEATURES.length} measures are defined; a model placed from one angle carries that angle&apos;s only.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
