"use client";
// The mannequin, drawn in 3D (three.js) under the joint dots of PoseCanvas: the same camera, so a
// dot sits on its joint. Solid, softly lit parts (lib/mannequin.ts) in a warm neutral, the parts the
// picked handle moves in the accent. Drawn on demand: only when the pose, the view, the pick or the
// size changes, so nothing is drawn off-screen, when idle or under reduced motion. Loaded only on the
// model editor (next/dynamic), and if WebGL can't start the editor shows the joints and bones instead.

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

/** A part as a mesh, sized and turned to sit between its two points. */
function mesh(part: Part, material: THREE.Material): THREE.Object3D {
  const a = v(part.a);
  const b = v(part.b);
  const axis = b.clone().sub(a);
  const length = axis.length();
  const y = length > 1e-9 ? axis.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const basis = (across?: V3) => {
    let x = across ? v(across) : new THREE.Vector3(1, 0, 0);
    x = x.sub(y.clone().multiplyScalar(x.dot(y)));
    if (x.lengthSq() < 1e-9) x = Math.abs(y.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  let m: THREE.Mesh;
  if (part.kind === "ball") {
    m = new THREE.Mesh(new THREE.SphereGeometry(part.r, 20, 14), material);
    m.position.copy(a);
    return m;
  }
  if (part.kind === "limb") {
    m = new THREE.Mesh(new THREE.CylinderGeometry(part.r2, part.r, length, 20, 1), material);
  } else if (part.kind === "head") {
    m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), material);
    m.scale.set(part.depth ?? part.r, part.r2, part.r);
    m.position.copy(a);
    m.quaternion.copy(basis(part.across));
    return m;
  } else if (part.kind === "trunk" || part.kind === "hand" || part.kind === "foot") {
    // An ellipsoid: as long as the part, as wide and as deep as it is.
    m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), material);
    m.scale.set(part.r, Math.max(length / 2, part.r), part.depth ?? part.r);
  } else {
    m = new THREE.Mesh(new THREE.BoxGeometry(part.r * 2, length, (part.depth ?? part.r) * 2), material);
  }
  m.position.copy(a.clone().add(b).multiplyScalar(0.5));
  m.quaternion.copy(basis(part.across));
  return m;
}

export function MannequinView({ pose, camera, selected, onFail }: { pose: Pose; camera: Camera; selected: Handle | null; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const gl = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.OrthographicCamera; figure: THREE.Group } | null>(null);
  const failed = useRef(false);

  // Set up once: the renderer, the lights, the camera.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      failed.current = true;
      onFail();
      return;
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
    const figure = new THREE.Group();
    scene.add(figure);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    gl.current = { renderer, scene, cam, figure };
    return () => {
      figure.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
      gl.current = null;
    };
  }, [onFail]);

  // Draw: on any change of the pose, the view, the pick or the size.
  useEffect(() => {
    const g = gl.current;
    const el = box.current;
    if (!g || !el) return;
    const draw = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      g.renderer.setSize(w, h, false);
      g.renderer.domElement.style.width = `${w}px`;
      g.renderer.domElement.style.height = `${h}px`;
      // The SVG over it keeps its aspect and centres it (preserveAspectRatio "meet"): match that.
      const s = Math.min(w / camera.W, h / camera.H);
      const halfW = w / s / 2 / camera.scale;
      const halfH = h / s / 2 / camera.scale;
      g.cam.left = -halfW * camera.flip;
      g.cam.right = halfW * camera.flip;
      g.cam.top = halfH;
      g.cam.bottom = -halfH;
      g.cam.updateProjectionMatrix();
      // The middle of the picture: the centre point on the ground, raised to the picture's middle.
      const lift = (camera.groundY - camera.H / 2) / camera.scale;
      const middle = v([camera.centre[0], 0, camera.centre[1]]).add(v(camera.up).multiplyScalar(lift));
      g.cam.up.copy(v(camera.up));
      g.cam.position.copy(middle.clone().add(v(camera.toward).multiplyScalar(5)));
      g.cam.lookAt(middle);

      // The figure, rebuilt (a few dozen simple parts).
      g.figure.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
      g.figure.clear();
      const light = document.documentElement.dataset.theme === "light";
      const body = new THREE.MeshStandardMaterial({ color: light ? 0xa79c8a : 0xd8cfbd, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
      const joint = new THREE.MeshStandardMaterial({ color: light ? 0x8a7f6d : 0xb9ae9a, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
      const bat = new THREE.MeshStandardMaterial({ color: light ? 0xd9c7a0 : 0xeadcbc, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
      const picked = new THREE.MeshStandardMaterial({ color: light ? 0xb54700 : 0xff6a00, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
      const parts = mannequinParts(pose);
      const on = partsMovedBy(parts, selected);
      for (const part of parts) {
        const mat = on.has(part.key) ? picked : part.key.startsWith("bat") ? bat : part.kind === "ball" ? joint : body;
        g.figure.add(mesh(part, mat));
      }
      g.renderer.render(g.scene, g.cam);
      for (const m of [body, joint, bat, picked]) m.dispose();
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pose, camera, selected]);

  return <div ref={box} className="pointer-events-none absolute inset-0" aria-hidden />;
}
