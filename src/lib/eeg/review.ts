import type { EEGChannel, EEGRecording } from "./types";

export type EEGBandMode = "full" | "delta" | "theta" | "alpha" | "beta" | "gamma";
export type EEGReferenceMode = "raw" | "average";
export type EEGMontageMode = "referential" | "bipolar";

export interface EEGReviewSettings {
  band: EEGBandMode;
  reference: EEGReferenceMode;
  montage: EEGMontageMode;
  smoothing: number;
  artifactThreshold: number;
}

export interface EEGChannelQuality {
  label: string;
  quality: number;
  artifact: boolean;
  highAmplitudeFraction: number;
  derivativeFraction: number;
}

export interface EEGReviewResult {
  recording: EEGRecording;
  quality: EEGChannelQuality[];
  artifactCount: number;
}

const BIPOLAR_PAIRS = [
  ["Fp1", "F3"],
  ["F3", "C3"],
  ["C3", "P3"],
  ["P3", "O1"],
  ["Fp2", "F4"],
  ["F4", "C4"],
  ["C4", "P4"],
  ["P4", "O2"],
  ["F7", "T7"],
  ["T7", "P7"],
  ["F8", "T8"],
  ["T8", "P8"],
  ["Fz", "Cz"],
  ["Cz", "Pz"],
];

const BAND_LIMITS: Record<Exclude<EEGBandMode, "full">, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 45],
};

export function createReviewRecording(recording: EEGRecording, settings: EEGReviewSettings): EEGReviewResult {
  let channels = recording.channels.map((channel) => ({
    label: channel.label,
    unit: channel.unit,
    data: Float32Array.from(channel.data),
    min: channel.min,
    max: channel.max,
  }));

  if (settings.reference === "average") {
    channels = applyAverageReference(channels);
  }

  channels = channels.map((channel) => {
    let data = channel.data;

    if (settings.band !== "full") {
      const [low, high] = BAND_LIMITS[settings.band];
      data = bandPassFilter(data, recording.sampleRate, low, high);
    }

    if (settings.smoothing > 0) {
      data = smoothData(data, recording.sampleRate, settings.smoothing);
    }

    const { min, max } = getMinMax(data);
    return { ...channel, data, min, max };
  });

  if (settings.montage === "bipolar") {
    channels = buildBipolarMontage(channels);
  }

  const quality = channels.map((channel) => assessChannelQuality(channel, recording.sampleRate, settings.artifactThreshold));

  return {
    recording: {
      ...recording,
      channels,
    },
    quality,
    artifactCount: quality.filter((channel) => channel.artifact).length,
  };
}

export function summarizeReviewMetrics(recording: EEGRecording, currentTime: number, quality: EEGChannelQuality[]) {
  const center = Math.min(
    Math.max(0, Math.floor(currentTime * recording.sampleRate)),
    Math.max(0, recording.channels[0]?.data.length - 1 ?? 0),
  );

  const window = Math.max(8, Math.floor(recording.sampleRate * 0.35));
  const from = Math.max(0, center - window);
  const to = Math.min(recording.channels[0]?.data.length ?? 0, center + window + 1);

  const samplesByChannel = recording.channels.map((channel) => {
    const samples: number[] = [];
    for (let i = from; i < to; i++) samples.push(channel.data[i] ?? 0);
    return samples;
  });

  const rmsValues = samplesByChannel.map(rms);
  const meanRms = rmsValues.reduce((sum, value) => sum + value, 0) / Math.max(1, rmsValues.length);
  const synchrony = computeSynchrony(samplesByChannel);
  const entropy = computeEntropy(rmsValues);
  const dominantBand = inferDominantBand(recording.meta.profile);
  const goodChannels = quality.filter((channel) => !channel.artifact).length;

  return {
    meanRms,
    synchrony,
    entropy,
    dominantBand,
    goodChannels,
    artifactCount: quality.length - goodChannels,
  };
}

function applyAverageReference(channels: EEGChannel[]): EEGChannel[] {
  if (!channels.length) return channels;
  const length = channels[0].data.length;
  const average = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel.data[i] ?? 0;
    average[i] = sum / channels.length;
  }

  return channels.map((channel) => {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) data[i] = channel.data[i] - average[i];
    const { min, max } = getMinMax(data);
    return { ...channel, data, min, max };
  });
}

function buildBipolarMontage(channels: EEGChannel[]): EEGChannel[] {
  const byLabel = new Map(channels.map((channel) => [normalizeLabel(channel.label), channel]));
  const derived: EEGChannel[] = [];

  for (const [leftLabel, rightLabel] of BIPOLAR_PAIRS) {
    const left = byLabel.get(normalizeLabel(leftLabel));
    const right = byLabel.get(normalizeLabel(rightLabel));
    if (!left || !right) continue;

    const data = new Float32Array(Math.min(left.data.length, right.data.length));
    for (let i = 0; i < data.length; i++) data[i] = left.data[i] - right.data[i];
    const { min, max } = getMinMax(data);
    derived.push({
      label: `${leftLabel}-${rightLabel}`,
      unit: left.unit,
      data,
      min,
      max,
    });
  }

  return derived.length ? derived : channels;
}

function assessChannelQuality(channel: EEGChannel, sampleRate: number, artifactThreshold: number): EEGChannelQuality {
  const amplitudeThreshold = Math.max(35, artifactThreshold);
  let highAmplitude = 0;
  let derivativeSpikes = 0;

  for (let i = 0; i < channel.data.length; i++) {
    const value = Math.abs(channel.data[i]);
    if (value > amplitudeThreshold) highAmplitude += 1;
    if (i > 0 && Math.abs(channel.data[i] - channel.data[i - 1]) > amplitudeThreshold * 0.9) {
      derivativeSpikes += 1;
    }
  }

  const highAmplitudeFraction = highAmplitude / Math.max(1, channel.data.length);
  const derivativeFraction = derivativeSpikes / Math.max(1, channel.data.length);
  const penalty = Math.min(1, highAmplitudeFraction * 3.4 + derivativeFraction * 2.1);
  const quality = Math.max(0, 1 - penalty);

  return {
    label: channel.label,
    quality,
    artifact: quality < 0.55,
    highAmplitudeFraction,
    derivativeFraction,
  };
}

function bandPassFilter(data: Float32Array, sampleRate: number, lowCut: number, highCut: number) {
  const lowPassed = lowPassFilter(data, sampleRate, highCut);
  return highPassFilter(lowPassed, sampleRate, lowCut);
}

function lowPassFilter(data: Float32Array, sampleRate: number, cutoff: number) {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  const output = new Float32Array(data.length);
  output[0] = data[0] ?? 0;

  for (let i = 1; i < data.length; i++) {
    output[i] = output[i - 1] + alpha * (data[i] - output[i - 1]);
  }

  return output;
}

function highPassFilter(data: Float32Array, sampleRate: number, cutoff: number) {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = rc / (rc + dt);
  const output = new Float32Array(data.length);
  output[0] = data[0] ?? 0;

  for (let i = 1; i < data.length; i++) {
    output[i] = alpha * (output[i - 1] + data[i] - data[i - 1]);
  }

  return output;
}

function smoothData(data: Float32Array, sampleRate: number, smoothing: number) {
  const radius = Math.max(1, Math.floor(sampleRate * smoothing));
  const output = new Float32Array(data.length);

  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;
    const from = Math.max(0, i - radius);
    const to = Math.min(data.length, i + radius + 1);
    for (let j = from; j < to; j++) {
      sum += data[j];
      count += 1;
    }
    output[i] = sum / Math.max(1, count);
  }

  return output;
}

function getMinMax(data: Float32Array) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0 };
}

function rms(values: number[]) {
  let total = 0;
  for (const value of values) total += value * value;
  return Math.sqrt(total / Math.max(1, values.length));
}

function computeSynchrony(samplesByChannel: number[][]) {
  if (samplesByChannel.length < 2) return 0;

  let total = 0;
  let pairs = 0;
  for (let i = 0; i < samplesByChannel.length; i++) {
    for (let j = i + 1; j < samplesByChannel.length; j++) {
      total += correlation(samplesByChannel[i], samplesByChannel[j]);
      pairs += 1;
    }
  }

  return (total / Math.max(1, pairs) + 1) / 2;
}

function correlation(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (length < 2) return 0;

  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < length; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= length;
  meanB /= length;

  let numerator = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < length; i++) {
    const deltaA = a[i] - meanA;
    const deltaB = b[i] - meanB;
    numerator += deltaA * deltaB;
    varianceA += deltaA * deltaA;
    varianceB += deltaB * deltaB;
  }

  const denominator = Math.sqrt(varianceA * varianceB);
  if (!denominator) return 0;
  return numerator / denominator;
}

function computeEntropy(values: number[]) {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + Math.max(0.0001, value), 0);
  let entropy = 0;
  for (const value of values) {
    const probability = Math.max(0.0001, value) / total;
    entropy -= probability * Math.log2(probability);
  }
  return entropy / Math.log2(values.length || 1);
}

function inferDominantBand(profile?: string) {
  if (!profile) return "mixed";
  if (profile.includes("alpha")) return "alpha";
  if (profile.includes("beta")) return "beta";
  if (profile.includes("theta")) return "theta";
  if (profile.includes("seizure")) return "beta/gamma";
  return "mixed";
}

function normalizeLabel(label: string) {
  return label.trim().toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "");
}
