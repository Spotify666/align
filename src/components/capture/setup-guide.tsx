"use client";

import { useEffect, useRef, useState } from "react";
import { loadPose, detectFrame } from "@/lib/capture/pose";
import { Check, CameraOff, Question } from "../icons";

/** Plan view of where to put the phone, plus the frame the athlete should see. */
export function CameraPlacementDiagram() {
  return (
    <figure className="card p-4">
      <svg viewBox="0 0 320 170" className="w-full" role="img" aria-label="Camera placement: phone side-on to the batter, about 6 to 8 metres away at hip height, with the pitch running left to right.">
        <rect x="20" y="70" width="290" height="40" rx="3" fill="#1c2229" stroke="#36414c" />
        <line x1="60" y1="66" x2="60" y2="114" stroke="#e9e3d3" strokeWidth="1" />
        <line x1="48" y1="66" x2="48" y2="114" stroke="#e9e3d3" strokeWidth="1" opacity="0.5" />
        <rect x="40" y="86" width="6" height="8" fill="#e9e3d3" />
        <circle cx="68" cy="90" r="6" fill="#5ed6e6" />
        <text x="68" y="62" textAnchor="middle" fontSize="9" fill="#a7b0b8">batter</text>
        <text x="296" y="62" textAnchor="end" fontSize="9" fill="#a7b0b8">bowler →</text>
        <text x="150" y="94" textAnchor="middle" fontSize="9" fill="#5ed6e6" opacity="0.8">bounce zone in frame</text>
        <rect x="76" y="140" width="22" height="13" rx="2" fill="#d7a62a" />
        <path d="M87 140 L40 110 M87 140 L230 110" stroke="#d7a62a" strokeDasharray="3 3" fill="none" />
        <line x1="87" y1="135" x2="87" y2="114" stroke="#a7b0b8" strokeWidth="1" markerEnd="url(#a)" />
        <text x="104" y="150" fontSize="9" fill="#f3f0e8">phone · 6–8 m · hip height</text>
        <defs>
          <marker id="a" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="#a7b0b8" />
          </marker>
        </defs>
      </svg>
      <figcaption className="mt-2 text-sm text-muted">
        Square-on to the batter, landscape, on a tripod or wedged still. Keep the batter, bat, stumps and the bounce zone in frame for the whole delivery.
      </figcaption>
    </figure>
  );
}

type LiveCheck = { body: "pass" | "warn" | "fail"; level: "pass" | "warn"; landscape: boolean; people: number };

/**
 * Optional live framing check: camera preview with a batter silhouette guide and an
 * on-device pose check. Nothing is recorded or uploaded here.
 */
function Row({ ok, label }: { ok: "pass" | "warn" | "fail"; label: string }) {
  const Icon = ok === "pass" ? Check : ok === "fail" ? CameraOff : Question;
  return (
    <li className={`flex items-center gap-2 ${ok === "pass" ? "text-lime" : ok === "fail" ? "text-coral" : "text-amber"}`}>
      <Icon size={16} /> <span className="text-text">{label}</span>
    </li>
  );
}

export function LiveFramingCheck() {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [check, setCheck] = useState<LiveCheck | null>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 120 } }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const pose = await loadPose();
        let last = 0;
        const loop = (now: number) => {
          if (stop) return;
          raf = requestAnimationFrame(loop);
          if (now - last < 250 || v.readyState < 2) return;
          last = now;
          const r = detectFrame(pose, v, Math.round(now), null);
          const visible = r.body.filter((p) => p && p[2] > 0.5).length;
          const feet = [r.body[11], r.body[12], r.body[13], r.body[14]].some((p) => p && p[2] > 0.5 && p[1] < 0.98);
          const head = r.body[0] && r.body[0][2] > 0.5 && r.body[0][1] > 0.02;
          const ls = r.body[1];
          const rs = r.body[2];
          setCheck({
            body: visible >= 14 && feet && head ? "pass" : visible >= 8 ? "warn" : "fail",
            level: ls && rs && Math.abs(ls[1] - rs[1]) < 0.08 ? "pass" : "warn",
            landscape: v.videoWidth >= v.videoHeight,
            people: r.people,
          });
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Camera unavailable");
        setOn(false);
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on]);

  return (
    <div className="card overflow-hidden">
      <div className="relative bg-graphite aspect-video">
        <video ref={video} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${on ? "" : "hidden"}`} />
        <svg viewBox="0 0 160 90" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
          <line x1="0" y1="78" x2="160" y2="78" stroke="#d7a62a" strokeDasharray="2 2" strokeWidth="0.5" />
          <path d="M44 14 a4 4 0 1 1 0.1 0 M44 22 L44 46 M44 28 L54 40 M44 46 L36 76 M44 46 L56 76" stroke="#5ed6e6" strokeWidth="1.2" fill="none" opacity="0.7" />
          <rect x="18" y="8" width="56" height="72" fill="none" stroke="#f3f0e8" strokeWidth="0.4" strokeDasharray="1.5 1.5" opacity="0.6" />
          <text x="20" y="86" fontSize="3.6" fill="#f3f0e8" opacity="0.8">keep feet above this line · bowler side →</text>
        </svg>
        {!on && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div>
              <p className="text-sm text-muted">Optional: check framing with your camera. Nothing is recorded or uploaded.</p>
              <button className="btn btn-ghost mt-3" onClick={() => { setErr(null); setOn(true); }}>Start framing check</button>
              {err && <p className="mt-2 text-xs text-coral">{err}</p>}
            </div>
          </div>
        )}
      </div>
      {on && (
        <div className="p-3 flex flex-wrap items-center justify-between gap-3">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Row ok={check?.body ?? "warn"} label="Head to feet visible" />
            <Row ok={check?.landscape ? "pass" : "warn"} label="Landscape" />
            <Row ok={check?.level ?? "warn"} label="Camera level" />
            <Row ok={(check?.people ?? 1) <= 1 ? "pass" : "warn"} label="One person in frame" />
          </ul>
          <button className="btn btn-ghost" onClick={() => setOn(false)}>Stop</button>
        </div>
      )}
    </div>
  );
}
