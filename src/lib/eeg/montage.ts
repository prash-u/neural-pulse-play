// 10-20 system electrode positions, normalized to a unit sphere (radius ~ 0.95)
// Coordinates approximate standard 10-20 montage on a head mesh.
// Keys match common EEG channel label conventions (case-insensitive).

export type Vec3 = [number, number, number];

// x: left(-)/right(+), y: up(+)/down(-), z: front(+)/back(-)
export const MONTAGE_10_20: Record<string, Vec3> = {
  FP1: [-0.30, 0.55, 0.78],
  FP2: [0.30, 0.55, 0.78],
  F7: [-0.72, 0.35, 0.55],
  F3: [-0.42, 0.70, 0.48],
  FZ: [0.0, 0.80, 0.45],
  F4: [0.42, 0.70, 0.48],
  F8: [0.72, 0.35, 0.55],
  T7: [-0.95, 0.15, 0.0],
  T3: [-0.95, 0.15, 0.0],
  C3: [-0.50, 0.80, 0.0],
  CZ: [0.0, 0.98, 0.0],
  C4: [0.50, 0.80, 0.0],
  T8: [0.95, 0.15, 0.0],
  T4: [0.95, 0.15, 0.0],
  P7: [-0.72, 0.35, -0.55],
  T5: [-0.72, 0.35, -0.55],
  P3: [-0.42, 0.70, -0.48],
  PZ: [0.0, 0.80, -0.45],
  P4: [0.42, 0.70, -0.48],
  P8: [0.72, 0.35, -0.55],
  T6: [0.72, 0.35, -0.55],
  O1: [-0.30, 0.55, -0.78],
  OZ: [0.0, 0.60, -0.82],
  O2: [0.30, 0.55, -0.78],
  A1: [-0.98, -0.15, 0.0],
  A2: [0.98, -0.15, 0.0],
};

export function resolveElectrodePosition(label: string): Vec3 | null {
  const key = label.trim().toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "");
  if (MONTAGE_10_20[key]) return MONTAGE_10_20[key];
  // Try stripping suffixes like "-REF"
  const stripped = key.replace(/-.*$/, "").replace(/REF$/, "");
  return MONTAGE_10_20[stripped] ?? null;
}
