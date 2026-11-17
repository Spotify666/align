"use client";
// The mannequin, drawn in 3D (three.js): under the joint dots of the shot-model editor (PoseCanvas,
// the same camera, so a dot sits on its joint), and playing a real batter's movement on the home
// page (components/home/motion-figure.tsx). Solid, softly lit parts (lib/mannequin.ts) in a warm
// neutral; the parts a picked handle moves in the accent. Each part is made once and only moved
// after, so a movement plays without rebuilding anything. Drawn on demand: nothing is drawn unless
// asked, so nothing runs off-screen, when idle or under reduced motion. If WebGL can't start, the
// caller is told (`onFail`) and shows something else.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Handle, Pose, V3 } from "@/engine/pose-model";
import { mannequinParts, partsMovedBy, type Part } from "@/lib/mannequin";

export interface Camera {
  /** viewBox width and height, the scale (viewBox units per body height) and the ground's y. */
  W: number;
  H: number;
  scale: number;
  groundY: number;
  right: V3;
  up: V3;
  toward: V3;
  /** The point (forward, across) kept in the middle of the picture. */
  centre: readonly [number, number];
  /** -1 for a left-hander: the picture is seen from their own off side (nothing is mirrored in the pose). */
  flip: number;
}

const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

/** A part's mesh, made once at unit size: a limb a unit-tall tapered cylinder, the rest unit spheres or a box. */
function makeMesh(part: Part, material: THREE.Material): THREE.Mesh {
  if (part.kind === "limb") return new THREE.Mesh(new THREE.CylinderGeometry(part.r2, part.r, 1, 20, 1), material);
  if (part.kind === "blade") return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  return new THREE.Mesh(new THREE.SphereGeometry(1, part.kind === "ball" ? 20 : 24, part.kind === "ball" ? 14 : 18), material);
}

/** Moves and sizes a part's mesh to sit between its two points. */
function placeMesh(m: THREE.Mesh, part: Part) {
  const a = v(part.a);
  const b = v(part.b);
  const axis = b.clone().sub(a);
  const length = axis.length();
  const y = length > 1e-9 ? axis.clone().normalize() : new THREE.Vector3(0, 1, 0);
  let x = part.across ? v(part.across) : new THREE.Vector3(1, 0, 0);
  x = x.sub(y.clone().multiplyScalar(x.dot(y)));
  if (x.lengthSq() < 1e-9) x = Math.abs(y.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (part.kind === "ball") {
    m.position.copy(a);
    m.scale.setScalar(part.r);
  } else if (part.kind === "head") {
    m.position.copy(a);
    m.scale.set(part.depth ?? part.r, part.r2, part.r);
  } else if (part.kind === "limb") {
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.scale.set(1, Math.max(length, 1e-4), 1);
  } else if (part.kind === "blade") {
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.scale.set(part.r * 2, Math.max(length, 1e-4), (part.depth ?? part.r) * 2);
  } else {
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.scale.set(part.r, Math.max(length / 2, part.r), part.depth ?? part.r);
  }
}

/** A mannequin scene on a canvas: draw it for a pose, a camera and a pick, as often as asked. */
export interface MannequinScene {
  draw: (pose: Pose, camera: Camera, selected?: Handle | null) => void;
  dispose: () => void;
}

export function createMannequinScene(el: HTMLElement): MannequinScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x3a3630, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-1.5, 3, 2.5);
  scene.add(key);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  const light = document.documentElement.dataset.theme === "light";
  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  const materials = {
    body: mat(light ? 0xa79c8a : 0xd8cfbd),
    joint: mat(light ? 0x8a7f6d : 0xb9ae9a),
    bat: mat(light ? 0xd9c7a0 : 0xeadcbc),
    picked: mat(light ? 0xb54700 : 0xff6a00),
  };
  const meshes = new Map<string, THREE.Mesh>();

  const draw = (pose: Pose, camera: Camera, selected: Handle | null = null) => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    // An SVG drawn over it keeps its aspect and centres it (preserveAspectRatio "meet"): match that.
    const s = Math.min(w / camera.W, h / camera.H);
    const halfW = w / s / 2 / camera.scale;
    const halfH = h / s / 2 / camera.scale;
    cam.left = -halfW * camera.flip;
    cam.right = halfW * camera.flip;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.updateProjectionMatrix();
    const lift = (camera.groundY - camera.H / 2) / camera.scale;
    const middle = v([camera.centre[0], 0, camera.centre[1]]).add(v(camera.up).multiplyScalar(lift));
    cam.up.copy(v(camera.up));
    cam.position.copy(middle.clone().add(v(camera.toward).multiplyScalar(5)));
    cam.lookAt(middle);

    const parts = mannequinParts(pose);
    const on = partsMovedBy(parts, selected);
    const seen = new Set<string>();
    for (const part of parts) {
      seen.add(part.key);
      const material = on.has(part.key) ? materials.picked : part.key.startsWith("bat") ? materials.bat : part.kind === "ball" ? materials.joint : materials.body;
      let m = meshes.get(part.key);
      if (!m) {
        m = makeMesh(part, material);
        meshes.set(part.key, m);
        scene.add(m);
      }
      m.material = material;
      m.visible = true;
      placeMesh(m, part);
    }
    for (const [k, m] of meshes) if (!seen.has(k)) m.visible = false;
    renderer.render(scene, cam);
  };

  const dispose = () => {
    for (const m of meshes.values()) m.geometry.dispose();
    for (const m of Object.values(materials)) m.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
  return { draw, dispose };
}

/** The mannequin under the editor's joint dots: redrawn when the pose, the view, the pick or the size changes. */
export function MannequinView({ pose, camera, selected, onFail }: { pose: Pose; camera: Camera; selected: Handle | null; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<MannequinScene | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const s = createMannequinScene(box.current);
    if (!s) return onFail();
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, [onFail]);

  useEffect(() => {
    const el = box.current;
    if (!el || !scene.current) return;
    const draw = () => scene.current?.draw(pose, camera, selected);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pose, camera, selected]);

  return <div ref={box} className="pointer-events-none absolute inset-0" aria-hidden />;
}
