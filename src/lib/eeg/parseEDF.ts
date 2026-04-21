// Minimal EDF (European Data Format) parser — enough for visualization.
// Spec: https://www.edfplus.info/specs/edf.html
// We read the ASCII header then the interleaved 16-bit LE samples per record.

import type { EEGChannel, EEGRecording } from "./types";

function readAscii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s.trim();
}

export async function parseEDF(buffer: ArrayBuffer, name: string): Promise<EEGRecording> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 256) throw new Error("File too small to be EDF");

  // 256-byte fixed header
  const version = readAscii(view, 0, 8);
  const patient = readAscii(view, 8, 80);
  const recordingInfo = readAscii(view, 88, 80);
  const startDate = readAscii(view, 168, 8);
  const startTime = readAscii(view, 176, 8);
  const headerBytes = parseInt(readAscii(view, 184, 8), 10);
  const numRecords = parseInt(readAscii(view, 236, 8), 10);
  const recordDuration = parseFloat(readAscii(view, 244, 8));
  const ns = parseInt(readAscii(view, 252, 4), 10);

  if (!ns || ns < 1) throw new Error("EDF header: no signals");

  // Variable header (ns * 256 bytes): labels, transducers, units, physMin/Max, digMin/Max, prefilt, samplesPerRecord, reserved
  let off = 256;
  const labels: string[] = [];
  for (let i = 0; i < ns; i++) labels.push(readAscii(view, off + i * 16, 16));
  off += ns * 16;
  off += ns * 80; // transducer
  const units: string[] = [];
  for (let i = 0; i < ns; i++) units.push(readAscii(view, off + i * 8, 8));
  off += ns * 8;
  const physMin: number[] = [];
  for (let i = 0; i < ns; i++) physMin.push(parseFloat(readAscii(view, off + i * 8, 8)));
  off += ns * 8;
  const physMax: number[] = [];
  for (let i = 0; i < ns; i++) physMax.push(parseFloat(readAscii(view, off + i * 8, 8)));
  off += ns * 8;
  const digMin: number[] = [];
  for (let i = 0; i < ns; i++) digMin.push(parseFloat(readAscii(view, off + i * 8, 8)));
  off += ns * 8;
  const digMax: number[] = [];
  for (let i = 0; i < ns; i++) digMax.push(parseFloat(readAscii(view, off + i * 8, 8)));
  off += ns * 8;
  off += ns * 80; // prefilt
  const samplesPerRecord: number[] = [];
  for (let i = 0; i < ns; i++) samplesPerRecord.push(parseInt(readAscii(view, off + i * 8, 8), 10));
  off += ns * 8;
  // reserved 32 bytes per signal

  if (off + 32 * ns !== headerBytes && headerBytes) {
    // header size mismatch — trust headerBytes anyway
  }

  // Data starts at headerBytes
  const dataStart = headerBytes || (256 + ns * 256);
  const totalSamplesPerSignal = samplesPerRecord.map((s) => s * numRecords);

  const channels: EEGChannel[] = [];
  const scales = labels.map((_, i) => {
    const phys = physMax[i] - physMin[i];
    const dig = digMax[i] - digMin[i] || 1;
    return { gain: phys / dig, offset: physMin[i] - (digMin[i] * phys) / dig };
  });

  for (let i = 0; i < ns; i++) {
    channels.push({
      label: labels[i] || `CH${i + 1}`,
      data: new Float32Array(totalSamplesPerSignal[i]),
      unit: units[i] || "uV",
      min: physMin[i],
      max: physMax[i],
    });
  }

  // Deinterleave records
  let cursor = dataStart;
  const writePos = new Array(ns).fill(0);
  for (let r = 0; r < numRecords; r++) {
    for (let s = 0; s < ns; s++) {
      const count = samplesPerRecord[s];
      const ch = channels[s];
      const { gain, offset } = scales[s];
      for (let k = 0; k < count; k++) {
        const sample = view.getInt16(cursor, true);
        cursor += 2;
        ch.data[writePos[s]++] = sample * gain + offset;
      }
    }
  }

  // Assume uniform sample rate across channels (typical). Use max.
  const samplesPerSec = samplesPerRecord[0] / recordDuration;
  const duration = numRecords * recordDuration;

  return {
    id: `edf-${Date.now()}`,
    name,
    source: "upload",
    sampleRate: samplesPerSec,
    duration,
    channels,
    meta: { version, patient, recording: recordingInfo, startDate, startTime },
  };
}
