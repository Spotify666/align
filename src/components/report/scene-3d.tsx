"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CaptureObservation } from "@/engine/types";
import { BONES, smoothWorld, worldFrames, type V3, type WorldFrames } from "@/lib/viz";
import { J } from "@/engine/types";

const COLORS = {
  bg: 0x0a0d10,
  pitch: 0x1c2229,
  line: 0xd9d4c7,
  body: 0x5ed6e6,
  bat: 0xd7a62a,
  ball: 0xc8372d,
  trail: 0x5ed6e6,
  ref: 0xd7a62a,
  support: 0xb7f34a,
  stumps: 0xe9e3d3,
};

interface Props {
  obs: CaptureObservation;
  frame: number;
  reference?: { obs: CaptureObservation; offset: number } | null;
  autoRotate?: boolean;
  className?: string;
  label?: string;
  /** Loop these frames on the scene's own clock (slow motion), instead of following `frame`. */
  play?: { from: number; to: number; speed?: number };
  /** false: no drag or zoom, and touch scrolls the page (for a decorative hero). */
  interactive?: boolean;
  framing?: "wide" | "close";
}

const lerp3 = (a: V3 | null | undefined, b: V3 | null | undefined, t: number): V3 | null => {
  if (a && b) return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return (t < 0.5 ? (a ?? b) : (b ?? a)) ?? null;
};

function setSegments(geom: THREE.BufferGeometry, segs: Array<[V3, V3] | null>) {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  segs.forEach((s, i) => {
    const a = s?.[0] ?? [0, -10, 0];
    const b = s?.[1] ?? [0, -10, 0];
    pos.setXYZ(i * 2, a[0], a[1], a[2]);
    pos.setXYZ(i * 2 + 1, b[0], b[1], b[2]);
  });
  pos.needsUpdate = true;
  geom.computeBoundingSphere();
}

/** Joints at a fractional frame, interpolated between the two nearest frames. */
function jointsAt(w: WorldFrames, f: number): (V3 | null)[] {
  const n = w.joints.length;
  const i0 = Math.max(0, Math.min(n - 1, Math.floor(f)));
  const i1 = Math.min(n - 1, i0 + 1);
  const t = Math.max(0, Math.min(1, f - i0));
  const a = w.joints[i0] ?? [];
  const b = w.joints[i1] ?? [];
  return a.map((p, j) => lerp3(p, b[j], t));
}

function skeletonSegments(js: (V3 | null)[]) {
  return BONES.map(([a, b]) => {
    const pa = js[J[a]];
    const pb = js[J[b]];
    return pa && pb ? ([pa, pb] as [V3, V3]) : null;
  });
}

const HOLD_S = 1.1; // pause on the finished shot before looping
const FADE_S = 0.35;

export default function Scene3D({ obs, frame, reference, autoRotate = false, className, label, play, interactive = true, framing = "wide" }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const world = useMemo(() => smoothWorld(worldFrames(obs), obs.media.fps), [obs]);
  const refWorld = useMemo(() => (reference ? smoothWorld(worldFrames(reference.obs), reference.obs.media.fps) : null), [reference]);
  const playFrom = play?.from;
  const playTo = play?.to;
  const playSpeed = play?.speed ?? 0.35;
  const api = useRef<{ update: (f: number) => void } | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(COLORS.bg);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COLORS.bg, 9, 22);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    // Start where the phone was, a little to the side so depth reads; drag to orbit.
    const view = obs.camera.view;
    if (view === "front_on") camera.position.set(6.2, 1.7, 2.2);
    else if (view === "behind") camera.position.set(-4.4, 1.8, 2.2);
    else if (framing === "close") camera.position.set(3.5, 1.55, 4.1);
    else camera.position.set(4.6, 1.9, 5.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(view === "front_on" || view === "behind" ? 0.5 : framing === "close" ? 0.9 : 1.1, 0.85, 0);
    controls.enabled = interactive;
    if (!interactive) renderer.domElement.style.touchAction = "pan-y";
    controls.enableDamping = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotate = autoRotate && !reduce;
    controls.autoRotateSpeed = 0.6;

    scene.add(new THREE.HemisphereLight(0xf3f0e8, 0x0a0d10, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 6, 4);
    scene.add(sun);

    // Pitch strip, creases, stumps.
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.05), new THREE.MeshStandardMaterial({ color: COLORS.pitch, roughness: 1 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(5, 0, 0);
    scene.add(pitch);
    const grid = new THREE.GridHelper(14, 14, 0x2d3640, 0x222a32);
    grid.position.set(5, 0.002, 0);
    scene.add(grid);
    const lineMat = new THREE.LineBasicMaterial({ color: COLORS.line, transparent: true, opacity: 0.8 });
    const creases: Array<[V3, V3]> = [
      [[1.22, 0.004, -1.6], [1.22, 0.004, 1.6]],
      [[0, 0.004, -1.32], [0, 0.004, 1.32]],
      [[0, 0.004, -1.32], [2.44, 0.004, -1.32]],
      [[0, 0.004, 1.32], [2.44, 0.004, 1.32]],
    ];
    for (const [a, b] of creases) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
      scene.add(new THREE.Line(g, lineMat));
    }
    const stumpMat = new THREE.MeshStandardMaterial({ color: COLORS.stumps, roughness: 0.6 });
    for (const z of [-0.114, 0, 0.114]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.711, 12), stumpMat);
      s.position.set(0, 0.3555, z);
      scene.add(s);
    }

    // Body skeleton.
    const estimated = world.depth !== "measured";
    const boneGeom = new THREE.BufferGeometry();
    boneGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BONES.length * 6), 3));
    const boneMat = estimated
      ? new THREE.LineDashedMaterial({ color: COLORS.body, dashSize: 0.05, gapSize: 0.025, transparent: true, opacity: 0.95 })
      : new THREE.LineBasicMaterial({ color: COLORS.body });
    const bones = new THREE.LineSegments(boneGeom, boneMat);
    scene.add(bones);

    const jointMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.028, 12, 10),
      new THREE.MeshStandardMaterial({ color: COLORS.body, emissive: COLORS.body, emissiveIntensity: 0.35 }),
      obs.body[0]?.length ?? 17,
    );
    scene.add(jointMesh);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 20, 16),
      new THREE.MeshStandardMaterial({ color: COLORS.body, transparent: true, opacity: 0.25, emissive: COLORS.body, emissiveIntensity: 0.2 }),
    );
    scene.add(head);

    // Bat.
    const bat = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.04, 0.108), new THREE.MeshStandardMaterial({ color: COLORS.bat, roughness: 0.5 }));
    scene.add(bat);

    // Ball and trajectory.
    // While playing, the trail grows with the ball; otherwise the whole path is shown.
    const ballIdx = world.ball.flatMap((b, i) => (b ? [i] : []));
    const trailGeom = new THREE.BufferGeometry();
    trailGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array((ballIdx.length + 1) * 3), 3));
    const trailMat = new THREE.LineBasicMaterial({ color: COLORS.trail, transparent: true, opacity: 0.55 });
    const trail = new THREE.Line(trailGeom, trailMat);
    trail.frustumCulled = false;
    trail.visible = ballIdx.length > 1;
    scene.add(trail);
    const setTrail = (f: number, current: V3 | null) => {
      const pos = trailGeom.getAttribute("position") as THREE.BufferAttribute;
      let k = 0;
      for (const i of ballIdx) {
        if (playing && i > f) break;
        const p = world.ball[i]!;
        pos.setXYZ(k++, p[0], p[1], p[2]);
      }
      if (playing && current && k > 0) pos.setXYZ(k++, current[0], current[1], current[2]);
      trailGeom.setDrawRange(0, k);
      pos.needsUpdate = true;
    };
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), new THREE.MeshStandardMaterial({ color: COLORS.ball, roughness: 0.4 }));
    scene.add(ball);

    // Centre-of-mass estimate and support base.
    const comGeom = new THREE.BufferGeometry();
    comGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    const com = new THREE.LineSegments(comGeom, new THREE.LineDashedMaterial({ color: COLORS.support, dashSize: 0.04, gapSize: 0.03 }));
    scene.add(com);

    // Reference ghost.
    let refBones: THREE.LineSegments | null = null;
    if (refWorld) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BONES.length * 6), 3));
      refBones = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLORS.ref, transparent: true, opacity: 0.5 }));
      scene.add(refBones);
    }

    const m4 = new THREE.Matrix4();
    const playing = playFrom !== undefined && playTo !== undefined && playTo > playFrom && !reduce;
    const at = <T,>(xs: T[], f: number, pick: (a: T, b: T, t: number) => T) => {
      const i0 = Math.max(0, Math.min(xs.length - 1, Math.floor(f)));
      const i1 = Math.min(xs.length - 1, i0 + 1);
      return pick(xs[i0]!, xs[i1]!, Math.max(0, Math.min(1, f - i0)));
    };
    const update = (f: number) => {
      const fr = Math.max(0, Math.min(world.joints.length - 1, f));
      const js = jointsAt(world, fr);
      setSegments(boneGeom, skeletonSegments(js));
      bones.computeLineDistances();
      js.forEach((p, i) => {
        m4.makeTranslation(p ? p[0] : 0, p ? p[1] : -10, p ? p[2] : 0);
        jointMesh.setMatrixAt(i, m4);
      });
      jointMesh.instanceMatrix.needsUpdate = true;
      const nose = js[J.nose];
      head.visible = !!nose;
      if (nose) head.position.set(nose[0] - 0.06, nose[1], nose[2]);

      const b = at(world.bat, fr, (p, q, t) => (p && q ? ([lerp3(p[0], q[0], t)!, lerp3(p[1], q[1], t)!] as [V3, V3]) : t < 0.5 ? (p ?? q) : (q ?? p)));
      bat.visible = !!b;
      if (b) {
        const [h, t] = b;
        const dir = new THREE.Vector3(t[0] - h[0], t[1] - h[1], t[2] - h[2]);
        const len = dir.length() || 0.86;
        bat.scale.set(len / 0.86, 1, 1);
        bat.position.set((h[0] + t[0]) / 2, (h[1] + t[1]) / 2, (h[2] + t[2]) / 2);
        bat.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
      }

      // The ball only shows where it was seen: no bridging across gaps.
      const bp = world.ball[Math.floor(fr)] && world.ball[Math.ceil(fr)] ? at(world.ball, fr, lerp3) : (world.ball[Math.round(fr)] ?? null);
      ball.visible = !!bp;
      if (bp) ball.position.set(...bp);
      setTrail(fr, bp);

      const c = at(world.centre, fr, lerp3);
      const fa = js[J.left_ankle];
      const ba = js[J.right_ankle];
      const segs: Array<[V3, V3] | null> = [c ? [c, [c[0], 0.01, c[2]]] : null, fa && ba ? [[fa[0], 0.01, fa[2]], [ba[0], 0.01, ba[2]]] : null];
      setSegments(comGeom, segs);
      com.computeLineDistances();

      if (refWorld && refBones && reference) {
        const rf = Math.max(0, Math.min(refWorld.joints.length - 1, fr + reference.offset));
        setSegments(refBones.geometry, skeletonSegments(jointsAt(refWorld, rf)));
      }
    };
    api.current = { update };
    update(playing ? playFrom! : frame);

    // Fade the figure out and back in around the loop point, so the replay never snaps.
    const fading = [boneMat, jointMesh.material, head.material, bat.material, ball.material, trailMat, com.material] as THREE.Material[];
    const baseOpacity = fading.map((m) => m.opacity);
    fading.forEach((m) => (m.transparent = true));
    const setAlpha = (a: number) => fading.forEach((m, i) => (m.opacity = baseOpacity[i]! * a));
    const fps = obs.media.fps && obs.media.fps > 0 ? obs.media.fps : 30;
    const runS = playing ? (playTo! - playFrom!) / fps / playSpeed : 0;
    let clock = 0;
    let last = performance.now();

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
    io.observe(el);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000); // a hidden tab never jumps the clock
      last = now;
      if (!visible) return;
      if (playing) {
        clock = (clock + dt) % (runS + HOLD_S);
        const p = Math.min(1, clock / runS);
        update(playFrom! + p * (playTo! - playFrom!));
        const tail = runS + HOLD_S - clock;
        setAlpha(Math.min(1, clock / FADE_S, tail / FADE_S));
      }
      controls.update(dt);
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      el.removeChild(renderer.domElement);
      api.current = null;
    };
    // Rebuild only when the data changes; frame updates go through api.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, refWorld, autoRotate, playFrom, playTo, playSpeed, interactive, framing, obs.camera.view]);

  useEffect(() => {
    if (playFrom === undefined) api.current?.update(frame);
  }, [frame, playFrom]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={mount} className="absolute inset-0" role="img" aria-label={label ?? "3D reconstruction of body, bat and ball. Drag to rotate."} />
      <div className="pointer-events-none absolute left-3 bottom-3 right-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-white/70 num">
        <span><span className="inline-block w-3 border-t-2 border-[#5ed6e6] align-middle mr-1" />{world.depth === "measured" ? "body (triangulated)" : "body (depth estimated)"}</span>
        <span><span className="inline-block w-3 border-t-2 border-[#d7a62a] align-middle mr-1" />bat</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-[#c8372d] align-middle mr-1" />ball</span>
        <span><span className="inline-block w-3 border-t-2 border-dashed border-[#b7f34a] align-middle mr-1" />centre / base</span>
        {reference && <span><span className="inline-block w-3 border-t-2 border-[#d7a62a]/60 align-middle mr-1" />reference</span>}
      </div>
      {world.depth !== "measured" && (
        <p className="pointer-events-none absolute right-3 top-3 max-w-[11rem] text-right text-[0.66rem] leading-snug text-[#f0b54a]">
          Single camera: depth is an estimate, drawn dashed.
        </p>
      )}
    </div>
  );
}
