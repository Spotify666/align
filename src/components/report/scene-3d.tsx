"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CaptureObservation } from "@/engine/types";
import { BONES, worldFrames, type V3, type WorldFrames } from "@/lib/viz";
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
}

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

function skeletonSegments(w: WorldFrames, frame: number) {
  const js = w.joints[frame];
  return BONES.map(([a, b]) => {
    const pa = js?.[J[a]];
    const pb = js?.[J[b]];
    return pa && pb ? ([pa, pb] as [V3, V3]) : null;
  });
}

export default function Scene3D({ obs, frame, reference, autoRotate = false, className, label }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const world = useMemo(() => worldFrames(obs), [obs]);
  const refWorld = useMemo(() => (reference ? worldFrames(reference.obs) : null), [reference]);
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
    camera.position.set(4.6, 1.9, 5.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(1.1, 0.85, 0);
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
    const ballPts = world.ball.filter((b): b is V3 => !!b);
    if (ballPts.length > 1) {
      const g = new THREE.BufferGeometry().setFromPoints(ballPts.map((p) => new THREE.Vector3(...p)));
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: COLORS.trail, transparent: true, opacity: 0.55 })));
    }
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
    const update = (f: number) => {
      const fr = Math.max(0, Math.min(world.joints.length - 1, f));
      setSegments(boneGeom, skeletonSegments(world, fr));
      bones.computeLineDistances();
      const js = world.joints[fr] ?? [];
      js.forEach((p, i) => {
        m4.makeTranslation(p ? p[0] : 0, p ? p[1] : -10, p ? p[2] : 0);
        jointMesh.setMatrixAt(i, m4);
      });
      jointMesh.instanceMatrix.needsUpdate = true;
      const nose = js[J.nose];
      head.visible = !!nose;
      if (nose) head.position.set(nose[0] - 0.06, nose[1], nose[2]);

      const b = world.bat[fr];
      bat.visible = !!b;
      if (b) {
        const [h, t] = b;
        const dir = new THREE.Vector3(t[0] - h[0], t[1] - h[1], t[2] - h[2]);
        const len = dir.length() || 0.86;
        bat.scale.set(len / 0.86, 1, 1);
        bat.position.set((h[0] + t[0]) / 2, (h[1] + t[1]) / 2, (h[2] + t[2]) / 2);
        bat.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
      }

      const bp = world.ball[fr];
      ball.visible = !!bp;
      if (bp) ball.position.set(...bp);

      const c = world.centre[fr];
      const fa = js[J.left_ankle];
      const ba = js[J.right_ankle];
      const segs: Array<[V3, V3] | null> = [c ? [c, [c[0], 0.01, c[2]]] : null, fa && ba ? [[fa[0], 0.01, fa[2]], [ba[0], 0.01, ba[2]]] : null];
      setSegments(comGeom, segs);
      com.computeLineDistances();

      if (refWorld && refBones && reference) {
        const rf = Math.max(0, Math.min(refWorld.joints.length - 1, fr + reference.offset));
        setSegments(refBones.geometry, skeletonSegments(refWorld, rf));
      }
    };
    api.current = { update };
    update(frame);

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
      if (!visible) return;
      controls.update();
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
  }, [world, refWorld, autoRotate]);

  useEffect(() => {
    api.current?.update(frame);
  }, [frame]);

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
