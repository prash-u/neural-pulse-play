// Shared EEG data types

export interface EEGChannel {
  label: string;
  /** Samples for the channel, interleaved/normalized to the recording duration. */
  data: Float32Array;
  /** Physical unit, e.g. "uV". */
  unit: string;
  /** Min/max for scaling. */
  min: number;
  max: number;
}

export interface EEGRecording {
  id: string;
  name: string;
  source: "demo" | "upload" | "url";
  /** Samples per second (uniform across channels). */
  sampleRate: number;
  /** Duration in seconds. */
  duration: number;
  channels: EEGChannel[];
  /** Patient / metadata bag. */
  meta: Record<string, string>;
}
