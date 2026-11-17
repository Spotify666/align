"use client";
// The shot models a person has made (/models), kept on this device, and the one they chose to
// be checked against. Small (a few kilobytes each), so they live in localStorage beside the
// profile. Nothing here is sent anywhere.

import { MODEL_JOINTS, POSE_MODEL_SCHEMA, STRICTNESS, ground, modelFromText, type ModelAngles, type MomentId, type Pose, type PoseModel, type V3 } from "@/engine/pose-model";
import type { Handedness, TargetShot } from "@/engine/types";
import starters from "./pose-starters.json";
import type { Starters } from "./pose-starters";

const KEY = "align.pose-models";
const CHOSEN = "align.pose-model.chosen";

const STARTERS = starters as unknown as Starters;
/** The pose a new model starts from: the real batter traced from the owner's clip (src/lib/pose-starters.ts); the author moves it. */
export function starterPose(shot: TargetShot, moment: MomentId): Pose {
  const joints = STARTERS[shot][moment].joints;
  return ground(Object.fromEntries(MODEL_JOINTS.map((k) => [k, joints[k] as V3])) as Pose);
}
/** Which way that batter's bat pointed (hands to toe), for a bat added to a model. */
export const starterBat = (shot: TargetShot, moment: MomentId): V3 => STARTERS[shot][moment].bat;

const newId = () => `pm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function newModel(o: { name: string; shot: TargetShot; battingSide: Handedness; angles: ModelAngles; heightCm: number | null }): PoseModel {
  const now = new Date().toISOString();
  return {
    schema: POSE_MODEL_SCHEMA,
    id: newId(),
    name: o.name.trim() || "My model",
    shot: o.shot,
    battingSide: o.battingSide,
    angles: o.angles,
    heightCm: o.heightCm,
    moments: { contact: starterPose(o.shot, "contact") },
    tolerance: { angleDeg: STRICTNESS[1].angleDeg, offset: STRICTNESS[1].offset },
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

const valid = (m: unknown): m is PoseModel =>
  !!m && typeof m === "object" && (m as PoseModel).schema === POSE_MODEL_SCHEMA && typeof (m as PoseModel).id === "string" && !!(m as PoseModel).moments?.contact;

export function listModels(): PoseModel[] {
  if (typeof window === "undefined") return [];
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown[];
    return Array.isArray(all) ? all.filter(valid).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  } catch {
    return [];
  }
}
export const getModel = (id: string | null | undefined): PoseModel | null => (id ? listModels().find((m) => m.id === id) ?? null : null);

export function saveModel(model: PoseModel): PoseModel {
  const saved = { ...model, updatedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify([saved, ...listModels().filter((m) => m.id !== model.id)]));
  return saved;
}
/** The passcode asked before a model is deleted (the owner's choice, 2026-11-17). A guard
 *  against deleting by mistake, not security: the models are on this device only. */
export const DELETE_PASSCODE = "1000";
export const passcodeOk = (typed: string) => typed.trim() === DELETE_PASSCODE;

export function deleteModel(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listModels().filter((m) => m.id !== id)));
  if (chosenModelId() === id) chooseModel(null);
}

/** Reads a model from its text and saves it as a new one. */
export function importModel(text: string): { ok: true; model: PoseModel } | { ok: false; problem: string } {
  const r = modelFromText(text, starterPose);
  if (!r.ok) return r;
  const now = new Date().toISOString();
  return { ok: true, model: saveModel({ ...r.model, id: newId(), createdAt: now, updatedAt: now }) };
}

/** The model new checks are set against; null: Aline's own. */
export function chosenModelId(): string | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(CHOSEN);
  return id && listModels().some((m) => m.id === id) ? id : null;
}
export function chooseModel(id: string | null) {
  if (id) localStorage.setItem(CHOSEN, id);
  else localStorage.removeItem(CHOSEN);
}
