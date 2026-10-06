"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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

/** A batter in whites and a blue shirt, as in the illustrations: the near side lit, the far side a shade darker. */
const KIT = {
  shirt: [0x3a7cc2, 0x2a5f99],
  whites: [0xf1ece1, 0xc9c1b1],
  skin: [0xc98f63, 0x9c6a47],
  glove: [0xffffff, 0xd5d9df],
  helmet: 0x1f3a63,
  shoe: [0xf6f6f6, 0xcfd2d6],
} as const;

interface Props {
  obs: CaptureObservation;
  frame: number;
  /** An earlier shot to overlay, lined up at contact (frames in each clip's own numbering). */
  reference?: { obs: CaptureObservation; contactSelf: number; contactRef: number } | null;
  /**
   * Fractional frame to show, polled every screen refresh (smooth replay between tracked
   * frames); when absent, `frame` is shown.
   */
  frameAt?: () => number;
  autoRotate?: boolean;
  className?: string;
  label?: string;
  /** Loop these frames on the scene's own clock (slow motion), instead of following `frame`. */
  play?: { from: number; to: number; speed?: number };
  /** false: no drag or zoom, and touch scrolls the page (for a decorative hero). */
  interactive?: boolean;
  framing?: "wide" | "close";
  /** "side": square to the pitch from the off side, the view a side-on phone would have had. */
  angle?: "auto" | "side";
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

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const midV = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/** A tapered limb between two joints (the cylinder's +y end is the far joint). */
function placeLimb(m: THREE.Object3D, a: V3 | null | undefined, b: V3 | null | undefined) {
  if (!a || !b) return void (m.visible = false);
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  if (len < 1e-4) return void (m.visible = false);
  m.visible = true;
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
  m.scale.set(1, len, 1);
}

/** A rounded part spanning `across` (x) and `along` (y), `deep` thick, centred at c. */
function placeBlock(m: THREE.Object3D, c: V3, along: THREE.Vector3, across: THREE.Vector3, sx: number, sy: number, sz: number) {
  const y = along.clone().normalize();
  const x = across.clone().sub(y.clone().multiplyScalar(across.dot(y)));
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).sub(y.clone().multiplyScalar(y.x));
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  m.visible = true;
  m.position.set(...c);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  m.scale.set(sx, sy, sz);
}

const HOLD_S = 1.1; // pause on the finished shot before looping
const FADE_S = 0.35;

export default function Scene3D({ obs, frame, reference, frameAt, autoRotate = false, className, label, play, interactive = true, framing = "wide", angle = "auto" }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const world = useMemo(() => smoothWorld(worldFrames(obs), obs.media.fps), [obs]);
  const refWorld = useMemo(() => (reference ? smoothWorld(worldFrames(reference.obs), reference.obs.media.fps) : null), [reference]);
  const playFrom = play?.from;
  const playTo = play?.to;
  const playSpeed = play?.speed ?? 0.35;
  const api = useRef<{ update: (f: number) => void } | null>(null);
  const frameAtRef = useRef(frameAt);
  useLayoutEffect(() => {
    frameAtRef.current = frameAt;
  });

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
    if (angle === "side") camera.position.set(0.9, 1.15, 5.6);
    else if (view === "front_on") camera.position.set(6.2, 1.7, 2.2);
    else if (view === "behind") camera.position.set(-4.4, 1.8, 2.2);
    else if (framing === "close") camera.position.set(3.2, 1.5, 3.7);
    else camera.position.set(3.9, 1.75, 4.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(angle === "side" ? 0.9 : view === "front_on" || view === "behind" ? 0.5 : framing === "close" ? 0.9 : 1.1, 0.85, 0);
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

    // The batter: limbs, trunk, helmet and gloves with volume (not a stick figure), the
    // front side (nearer the bowler) lit, the back side a shade darker so crossing arms and
    // legs read in depth.
    const front: "left" | "right" = obs.athlete.handedness === "left" ? "right" : "left";
    const back: "left" | "right" = front === "left" ? "right" : "left";
    const mats: THREE.MeshStandardMaterial[] = [];
    const mat = (color: number, rough = 0.7) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
      mats.push(m);
      return m;
    };
    const tone = (pair: readonly [number, number], side: "left" | "right") => (side === front ? pair[0] : pair[1]);
    const body = new THREE.Group();
    scene.add(body);
    const limbGeom = (r0: number, r1: number) => new THREE.CylinderGeometry(r1, r0, 1, 16, 1, true);
    const ball3 = (r: number) => new THREE.SphereGeometry(r, 18, 14);
    type Limb = { mesh: THREE.Mesh; a: number; b: number; ends: [THREE.Mesh, THREE.Mesh] };
    const limbs: Limb[] = [];
    const addLimb = (a: number, b: number, r0: number, r1: number, color: number) => {
      const m = mat(color);
      const mesh = new THREE.Mesh(limbGeom(r0, r1), m);
      const ea = new THREE.Mesh(ball3(r0), m);
      const eb = new THREE.Mesh(ball3(r1), m);
      body.add(mesh, ea, eb);
      limbs.push({ mesh, a, b, ends: [ea, eb] });
    };
    for (const side of [back, front] as const) {
      const j = (n: string) => J[`${side}_${n}` as keyof typeof J];
      addLimb(j("hip"), j("knee"), 0.082, 0.062, tone(KIT.whites, side)); // thigh
      addLimb(j("knee"), j("ankle"), 0.066, 0.05, tone(KIT.whites, side)); // padded shin
      addLimb(j("heel"), j("foot"), 0.042, 0.036, tone(KIT.shoe, side)); // shoe
      addLimb(j("shoulder"), j("elbow"), 0.05, 0.04, tone(KIT.shirt, side)); // upper arm, sleeve
      addLimb(j("elbow"), j("wrist"), 0.038, 0.031, tone(KIT.skin, side)); // forearm
    }
    // Gloves: rounded blocks at the hands, along the forearm.
    const gloves = [back, front].map((side) => {
      const m = new THREE.Mesh(ball3(1), mat(tone(KIT.glove, side), 0.55));
      body.add(m);
      return { mesh: m, e: J[`${side}_elbow` as keyof typeof J], w: J[`${side}_wrist` as keyof typeof J] };
    });
    // Trunk (chest to waist, tapering), hips, neck and helmet.
    // The trunk turned from a profile (radius by height, waist to the top of the shoulders):
    // a trim waist, the chest and back filling out, the shoulders rounding over to the neck.
    const trunkGeom = new THREE.LatheGeometry(
      [[0.78, 0], [0.8, 0.18], [0.9, 0.45], [0.99, 0.68], [1, 0.8], [0.92, 0.9], [0.7, 0.97], [0.36, 1]].map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ).translate(0, -0.5, 0);
    const trunk = new THREE.Mesh(trunkGeom, mat(KIT.shirt[0]));
    const pelvis = new THREE.Mesh(ball3(1), mat(KIT.whites[0]));
    const neck = new THREE.Mesh(limbGeom(0.05, 0.046), mat(KIT.skin[0]));
    const head = new THREE.Mesh(ball3(0.11), mat(KIT.helmet, 0.35));
    const face = new THREE.Mesh(ball3(0.072), mat(KIT.skin[0]));
    body.add(trunk, pelvis, neck, head, face);
    const placeBody = (js: (V3 | null)[]) => {
      for (const l of limbs) {
        const a = js[l.a];
        const b = js[l.b];
        placeLimb(l.mesh, a, b);
        l.ends[0].visible = !!a && l.mesh.visible;
        l.ends[1].visible = !!b && l.mesh.visible;
        if (a) l.ends[0].position.set(...a);
        if (b) l.ends[1].position.set(...b);
      }
      for (const g of gloves) {
        const e = js[g.e];
        const w = js[g.w];
        g.mesh.visible = !!(e && w);
        if (e && w) {
          const d = v3(w).sub(v3(e)).normalize();
          const c: V3 = [w[0] + d.x * 0.045, w[1] + d.y * 0.045, w[2] + d.z * 0.045];
          placeBlock(g.mesh, c, d, new THREE.Vector3(0, 0, 1), 0.04, 0.055, 0.035);
        }
      }
      const ls = js[J.left_shoulder];
      const rs = js[J.right_shoulder];
      const lh = js[J.left_hip];
      const rh = js[J.right_hip];
      const nose = js[J.nose];
      const ok = !!(ls && rs && lh && rh);
      trunk.visible = pelvis.visible = ok;
      if (ls && rs && lh && rh) {
        const sm = midV(ls, rs);
        const hm = midV(lh, rh);
        const spine = v3(sm).sub(v3(hm));
        const len = spine.length();
        const across = v3(rs).sub(v3(ls));
        const half = Math.max(0.12, across.length() / 2 + 0.035);
        // From the waist (a little above the hip joints) to the top of the shoulders.
        const lo = v3(hm).add(spine.clone().multiplyScalar(0.12));
        const hi = v3(sm).add(spine.clone().normalize().multiplyScalar(0.06));
        const c = lo.clone().add(hi).multiplyScalar(0.5);
        placeBlock(trunk, [c.x, c.y, c.z], spine, across, half, hi.distanceTo(lo), 0.105);
        const hipAcross = v3(rh).sub(v3(lh));
        placeBlock(pelvis, hm, spine, hipAcross, Math.max(0.12, hipAcross.length() / 2 + 0.06), Math.max(0.08, len * 0.2), 0.11);
        if (nose) {
          // The head's centre sits behind and above the nose, over the neck.
          const toNose = v3(nose).sub(v3(sm));
          const hc = v3(sm).add(toNose.clone().multiplyScalar(0.8)).add(new THREE.Vector3(0, 0.03, 0));
          head.visible = face.visible = neck.visible = true;
          head.position.copy(hc);
          const fwd = v3(nose).sub(hc);
          fwd.y = 0;
          face.position.copy(hc.clone().add(fwd.lengthSq() > 1e-6 ? fwd.normalize().multiplyScalar(0.05) : new THREE.Vector3()).add(new THREE.Vector3(0, -0.025, 0)));
          placeLimb(neck, sm, [hc.x, hc.y - 0.06, hc.z]);
        } else head.visible = face.visible = neck.visible = false;
      } else head.visible = face.visible = neck.visible = false;
    };

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

    const selfFps = obs.media.fps && obs.media.fps > 0 ? obs.media.fps : 30;
    const refFps = reference?.obs.media.fps && reference.obs.media.fps > 0 ? reference.obs.media.fps : selfFps;
    const midAnkle = (w: typeof world, f: number): [number, number] | null => {
      const js = jointsAt(w, Math.max(0, Math.min(w.joints.length - 1, f)));
      const a = js[J.left_ankle];
      const b = js[J.right_ankle];
      return a && b ? [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2] : null;
    };
    const shift: [number, number] = (() => {
      if (!refWorld || !reference) return [0, 0];
      const m = midAnkle(world, reference.contactSelf);
      const r = midAnkle(refWorld, reference.contactRef);
      return m && r ? [m[0] - r[0], m[1] - r[1]] : [0, 0];
    })();
    const playing = playFrom !== undefined && playTo !== undefined && playTo > playFrom && !reduce;
    const at = <T,>(xs: T[], f: number, pick: (a: T, b: T, t: number) => T) => {
      const i0 = Math.max(0, Math.min(xs.length - 1, Math.floor(f)));
      const i1 = Math.min(xs.length - 1, i0 + 1);
      return pick(xs[i0]!, xs[i1]!, Math.max(0, Math.min(1, f - i0)));
    };
    const update = (f: number) => {
      const fr = Math.max(0, Math.min(world.joints.length - 1, f));
      const js = jointsAt(world, fr);
      placeBody(js);

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
      // The centre line: a plumb line through the centre of mass, from the ground up to the
      // top of the head, so head, trunk and base can be read against one vertical.
      const top = head.visible ? head.position.y + 0.11 : (c?.[1] ?? 0) + 0.8;
      const segs: Array<[V3, V3] | null> = [c ? [[c[0], top, c[2]], [c[0], 0.01, c[2]]] : null, fa && ba ? [[fa[0], 0.01, fa[2]], [ba[0], 0.01, ba[2]]] : null];
      setSegments(comGeom, segs);
      com.computeLineDistances();

      if (refWorld && refBones && reference) {
        // Same moment (seconds from contact), same place (feet over feet at contact).
        const rf = Math.max(0, Math.min(refWorld.joints.length - 1, reference.contactRef + (fr - reference.contactSelf) * (refFps / selfFps)));
        setSegments(
          refBones.geometry,
          skeletonSegments(jointsAt(refWorld, rf).map((p) => (p ? ([p[0] + shift[0], p[1], p[2] + shift[1]] as V3) : null))),
        );
      }
    };
    api.current = { update };
    update(playing ? playFrom! : frame);

    // Fade the figure out and back in around the loop point, so the replay never snaps.
    const fading = [...mats, bat.material, ball.material, trailMat, com.material] as THREE.Material[];
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
    let shown = NaN;
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
      } else if (frameAtRef.current) {
        const f = frameAtRef.current();
        if (f !== shown) {
          shown = f;
          update(f);
        }
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
  }, [world, refWorld, autoRotate, playFrom, playTo, playSpeed, interactive, framing, obs.camera.view, angle]);

  useEffect(() => {
    if (playFrom === undefined && !frameAtRef.current) api.current?.update(frame);
  }, [frame, playFrom]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={mount} className="absolute inset-0" role="img" aria-label={label ?? "3D reconstruction of body, bat and ball. Drag to rotate."} />
      <div className="pointer-events-none absolute left-3 bottom-3 right-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-white/70 num">
        <span><span className="inline-block h-2 w-2 rounded-full bg-[#3a7cc2] align-middle mr-1" />{world.depth === "measured" ? "body (triangulated)" : "body (depth estimated)"}</span>
        <span><span className="inline-block w-3 border-t-2 border-[#d7a62a] align-middle mr-1" />bat</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-[#c8372d] align-middle mr-1" />ball</span>
        <span><span className="inline-block w-3 border-t-2 border-dashed border-[#b7f34a] align-middle mr-1" />centre line / base</span>
        {reference && <span><span className="inline-block w-3 border-t-2 border-[#d7a62a]/60 align-middle mr-1" />earlier shot</span>}
      </div>
      {world.depth !== "measured" && (
        <p className="pointer-events-none absolute right-3 top-3 max-w-[11rem] text-right text-[0.66rem] leading-snug text-[#f0b54a]">
          Single camera: depth is an estimate.
        </p>
      )}
    </div>
  );
}
