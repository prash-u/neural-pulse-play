// Synthetic demo recordings generated on the fly.
// Produces plausible multi-band EEG-ish signals across the 10-20 montage.

import type { EEGChannel, EEGRecording } from "./types";

interface DemoSpec {
  id: string;
  name: string;
  description: string;
  /** Seconds */
  duration: number;
  sampleRate: number;
  channels: string[];
  /** Dominant band */
  profile: "alpha" | "beta" | "theta" | "seizure";
}

export const DEMO_SAMPLES: DemoSpec[] = [
  {
    id: "alpha-rest",
    name: "Resting Alpha (eyes closed)",
    description: "Dominant 10Hz alpha rhythm over occipital regions",
    duration: 20,
    sampleRate: 256,
    channels: ["Fp1", "Fp2", "F3", "F4", "Fz", "C3", "C4", "Cz", "P3", "P4", "Pz", "O1", "O2", "T7", "T8"],
    profile: "alpha",
  },
  {
    id: "beta-focus",
    name: "Active Focus (beta)",
    description: "Elevated 20Hz beta over frontal/central cortex",
    duration: 20,
    sampleRate: 256,
    channels: ["Fp1", "Fp2", "F3", "F4", "Fz", "C3", "C4", "Cz", "P3", "P4", "Pz", "O1", "O2", "T7", "T8"],
    profile: "beta",
  },
];

export function generateDemo(spec: DemoSpec): EEGRecording {
  const totalSamples = Math.floor(spec.duration * spec.sampleRate);
  const channels: EEGChannel[] = spec.channels.map((label, idx) => {
    const data = new Float32Array(totalSamples);
    const occipital = /O\d/i.test(label);
    const frontal = /F|Fp/i.test(label);
    const central = /C\d|Cz/i.test(label);

    // Band amplitudes depend on profile
    let alpha = 8, beta = 4, theta = 6;
    if (spec.profile === "alpha") alpha = occipital ? 45 : 18;
    if (spec.profile === "beta") beta = frontal || central ? 35 : 10;
    if (spec.profile === "theta") theta = 40;

    const phase = idx * 0.37;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / spec.sampleRate;
      const s =
        alpha * Math.sin(2 * Math.PI * 10 * t + phase) +
        beta * Math.sin(2 * Math.PI * 20 * t + phase * 1.3) +
        theta * Math.sin(2 * Math.PI * 6 * t + phase * 0.7) +
        12 * (Math.random() - 0.5); // noise
      data[i] = s;
    }
    return { label, data, unit: "uV", min: -80, max: 80 };
  });

  return {
    id: `demo-${spec.id}-${Date.now()}`,
    name: spec.name,
    source: "demo",
    sampleRate: spec.sampleRate,
    duration: spec.duration,
    channels,
    meta: { profile: spec.profile, description: spec.description, synthetic: "true" },
  };
}
