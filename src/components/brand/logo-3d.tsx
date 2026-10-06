"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LETTER_STROKE, LETTERS, MARK, type P } from "./logo-geometry";

/** A stroke segment as a rectangle, extended by `ext` at both ends so letter corners close. */
function segmentQuad(a: P, b: P, w: number, ext: number): P[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = (-uy * w) / 2;
  const ny = (ux * w) / 2;
  const a2: P = [a[0] - ux * ext, a[1] - uy * ext];
  const b2: P = [b[0] + ux * ext, b[1] + uy * ext];
  return [
    [a2[0] + nx, a2[1] + ny],
    [b2[0] + nx, b2[1] + ny],
    [b2[0] - nx, b2[1] - ny],
    [a2[0] - nx, a2[1] - ny],
  ];
}

const shapeOf = (poly: P[]) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y)));

/**
 * The Aline mark in 3D: its strokes extruded into solid, softly bevelled pieces in warm
 * white, lit like an object on a dark stage, turning slowly back and forth (still when
 * reduced motion is asked for) and leaning toward the pointer.
 */
export default function Logo3D({ className, label = "Aline" }: { className?: string; label?: string }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;

    const camera = new THREE.PerspectiveCamera(28, 1, 1, 6000);
    camera.position.set(0, 0, 2050);

    const material = new THREE.MeshPhysicalMaterial({ color: 0xf6f3ec, roughness: 0.32, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.25 });
    const group = new THREE.Group();
    const strokes = new THREE.ExtrudeGeometry(MARK.map(shapeOf), { depth: 70, bevelEnabled: true, bevelThickness: 7, bevelSize: 5, bevelSegments: 4, curveSegments: 1 });
    group.add(new THREE.Mesh(strokes, material));
    const letterShapes = LETTERS.flatMap((line) => line.slice(1).map((b, i) => shapeOf(segmentQuad(line[i]!, b, LETTER_STROKE, LETTER_STROKE / 2))));
    const letters = new THREE.ExtrudeGeometry(letterShapes, { depth: 26, bevelEnabled: true, bevelThickness: 2, bevelSize: 1, bevelSegments: 2, curveSegments: 1 });
    group.add(new THREE.Mesh(letters, material));
    // Centre the mark on its own middle, front faces toward the camera.
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    group.children.forEach((m) => m.position.set(-c.x, -c.y, -c.z));
    const pivot = new THREE.Group();
    pivot.add(group);
    scene.add(pivot);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-900, 1200, 1600);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(1400, 300, -900);
    scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      // Fit the mark (about 840 × 660) with a margin, whatever the box's shape.
      const fit = Math.max(660 / 0.8, 840 / 0.8 / camera.aspect);
      camera.position.z = fit / (2 * Math.tan((camera.fov * Math.PI) / 360));
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let tx = 0;
    let ty = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
    io.observe(el);
    let raf = 0;
    let t = 0;
    let last = performance.now();
    let lx = 0;
    let ly = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      if (!reduce) t += dt;
      lx += (tx - lx) * Math.min(1, dt * 3);
      ly += (ty - ly) * Math.min(1, dt * 3);
      pivot.rotation.y = (reduce ? -0.32 : Math.sin(t * 0.55) * 0.55) + lx * 0.18;
      pivot.rotation.x = (reduce ? 0.06 : Math.sin(t * 0.37) * 0.07) + ly * 0.1;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      strokes.dispose();
      letters.dispose();
      material.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mount} className={className ?? "relative h-full w-full"} role="img" aria-label={label} />;
}
