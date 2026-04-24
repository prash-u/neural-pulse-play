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
  {
    id: "theta-drift",
    name: "Drowsy Theta Drift",
    description: "Slow 6Hz theta builds across frontal and temporal regions",
    duration: 24,
    sampleRate: 256,
    channels: ["Fp1", "Fp2", "F3", "F4", "Fz", "C3", "C4", "Cz", "P3", "P4", "Pz", "O1", "O2", "T7", "T8"],
    profile: "theta",
  },
  {
    id: "temporal-spikes",
    name: "Temporal Spike Train",
    description: "Synthetic transient spikes that should flare the side electrodes",
    duration: 18,
    sampleRate: 256,
    channels: ["Fp1", "Fp2", "F3", "F4", "Fz", "C3", "C4", "Cz", "P3", "P4", "Pz", "O1", "O2", "T7", "T8"],
    profile: "seizure",
  },
];

export function generateDemo(spec: DemoSpec): EEGRecording {
  const totalSamples = Math.floor(spec.duration * spec.sampleRate);
  const channels: EEGChannel[] = spec.channels.map((label, idx) => {
    const data = new Float32Array(totalSamples);
    const occipital = /O\d/i.test(label);
    const frontal = /F|Fp/i.test(label);
    const central = /C\d|Cz/i.test(label);
    const temporal = /T\d/i.test(label);
    const posterior = /P|O/i.test(label);

    // Band amplitudes depend on profile
    let alpha = 8, beta = 4, theta = 6;
    if (spec.profile === "alpha") alpha = occipital ? 45 : 18;
    if (spec.profile === "beta") beta = frontal || central ? 35 : 10;
    if (spec.profile === "theta") theta = frontal || temporal ? 42 : 20;
    if (spec.profile === "seizure") {
      alpha = posterior ? 12 : 8;
      beta = temporal ? 18 : 7;
      theta = temporal ? 30 : 12;
    }

    const phase = idx * 0.37;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / spec.sampleRate;
      const drowsyRise = spec.profile === "theta" ? 0.6 + 0.7 * (i / totalSamples) : 1;
      const spikeTrain = spec.profile === "seizure" && temporal ? temporalSpikeTrain(t, phase) : 0;
      const generalizedSpike = spec.profile === "seizure" ? 10 * temporalSpikeTrain(t, phase + 1.1) : 0;
      const s =
        alpha * Math.sin(2 * Math.PI * 10 * t + phase) * (spec.profile === "theta" ? 0.7 : 1) +
        beta * Math.sin(2 * Math.PI * 20 * t + phase * 1.3) +
        theta * drowsyRise * Math.sin(2 * Math.PI * 6 * t + phase * 0.7) +
        spikeTrain +
        generalizedSpike +
        12 * (Math.random() - 0.5); // noise
      data[i] = s;
    }
    return { label, data, unit: "uV", min: -120, max: 120 };
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

function temporalSpikeTrain(t: number, phase: number) {
  const cadence = 1.25;
  const cycle = (t * cadence + phase * 0.07) % 1;
  const spike = Math.exp(-Math.pow((cycle - 0.12) / 0.035, 2));
  const rebound = -0.42 * Math.exp(-Math.pow((cycle - 0.2) / 0.06, 2));
  return 80 * (spike + rebound);
}
