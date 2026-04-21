// CSV parser for EEG recordings.
// Expected format: first row = channel labels (and optionally a "time" column),
// subsequent rows = samples (one per row). Sample rate is inferred from a
// "time" column (seconds) or must be provided.

import type { EEGChannel, EEGRecording } from "./types";

export interface CSVParseOptions {
  /** Fallback sample rate if no "time" column is present. */
  defaultSampleRate?: number;
}

export function parseCSV(text: string, name: string, options: CSVParseOptions = {}): EEGRecording {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV is empty or only has a header");

  const delim = detectDelimiter(lines[0]);
  const headers = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ""));
  const lower = headers.map((h) => h.toLowerCase());
  const timeIdx = lower.findIndex((h) => h === "time" || h === "t" || h === "timestamp" || h === "seconds");

  const chIdx: number[] = [];
  headers.forEach((_, i) => { if (i !== timeIdx) chIdx.push(i); });
  const numSamples = lines.length - 1;

  const channels: EEGChannel[] = chIdx.map((i) => ({
    label: headers[i] || `CH${i + 1}`,
    data: new Float32Array(numSamples),
    unit: "uV",
    min: Infinity,
    max: -Infinity,
  }));
  const times = timeIdx >= 0 ? new Float32Array(numSamples) : null;

  for (let r = 0; r < numSamples; r++) {
    const parts = lines[r + 1].split(delim);
    if (times) times[r] = parseFloat(parts[timeIdx]);
    chIdx.forEach((col, k) => {
      const v = parseFloat(parts[col]);
      const safe = Number.isFinite(v) ? v : 0;
      channels[k].data[r] = safe;
      if (safe < channels[k].min) channels[k].min = safe;
      if (safe > channels[k].max) channels[k].max = safe;
    });
  }

  let sampleRate = options.defaultSampleRate ?? 256;
  let duration = numSamples / sampleRate;
  if (times && numSamples > 1) {
    duration = times[numSamples - 1] - times[0];
    if (duration > 0) sampleRate = (numSamples - 1) / duration;
  }

  channels.forEach((c) => {
    if (!Number.isFinite(c.min) || !Number.isFinite(c.max) || c.min === c.max) { c.min = -100; c.max = 100; }
  });

  return {
    id: `csv-${Date.now()}`,
    name,
    source: "upload",
    sampleRate,
    duration,
    channels,
    meta: { rows: String(numSamples), channels: String(channels.length) },
  };
}

function detectDelimiter(line: string): string {
  const candidates = [",", "\t", ";"];
  let best = ",";
  let bestCount = -1;
  for (const c of candidates) {
    const count = line.split(c).length;
    if (count > bestCount) { best = c; bestCount = count; }
  }
  return best;
}
