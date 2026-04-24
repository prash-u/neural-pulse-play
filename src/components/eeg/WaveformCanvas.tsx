import { useEffect, useRef } from "react";
import type { EEGChannelQuality } from "@/lib/eeg/review";
import type { EEGRecording } from "@/lib/eeg/types";

interface Props {
  recording: EEGRecording;
  currentTime: number;
  /** Window length in seconds */
  window?: number;
  className?: string;
  quality?: EEGChannelQuality[];
}

/**
 * Stacked scrolling EEG waveform canvas. Each channel rendered as its own lane.
 */
export function WaveformCanvas({ recording, currentTime, window = 10, className, quality = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = globalThis.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, rect.width);
    const H = Math.max(240, rect.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = "hsl(218 60% 5%)";
    ctx.fillRect(0, 0, W, H);

    const channels = recording.channels;
    const qualityByLabel = new Map(quality.map((channel) => [channel.label, channel]));
    const laneHeight = H / channels.length;
    const labelWidth = 64;
    const plotLeft = labelWidth;
    const plotWidth = W - plotLeft - 8;

    const halfWin = window / 2;
    const startSec = currentTime - halfWin;
    const endSec = currentTime + halfWin;

    // Grid lines (time)
    ctx.strokeStyle = "hsl(215 30% 70% / 0.08)";
    ctx.lineWidth = 1;
    for (let s = Math.ceil(startSec); s <= Math.floor(endSec); s++) {
      const x = plotLeft + ((s - startSec) / window) * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Channels
    channels.forEach((ch, idx) => {
      const laneY = idx * laneHeight;
      const centerY = laneY + laneHeight / 2;
      // lane separator
      ctx.strokeStyle = "hsl(215 30% 70% / 0.06)";
      ctx.beginPath();
      ctx.moveTo(0, laneY);
      ctx.lineTo(W, laneY);
      ctx.stroke();

      // label
      const channelQuality = qualityByLabel.get(ch.label);
      ctx.fillStyle = channelQuality?.artifact ? "hsl(42 95% 70%)" : "hsl(213 45% 97% / 0.85)";
      ctx.font = "600 11px 'SF Pro Display', system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(ch.label.replace(/-REF|EEG /gi, "").slice(0, 8), 8, centerY);

      // waveform
      const range = Math.max(1, Math.abs(ch.max - ch.min));
      const amp = (laneHeight * 0.45);
      const startIdx = Math.max(0, Math.floor(startSec * recording.sampleRate));
      const endIdx = Math.min(ch.data.length, Math.ceil(endSec * recording.sampleRate));
      const samples = endIdx - startIdx;
      if (samples <= 1) return;
      const step = Math.max(1, Math.floor(samples / plotWidth));

      ctx.strokeStyle = channelQuality?.artifact
        ? "hsl(42 95% 70%)"
        : idx % 2 === 0 ? "hsl(195 100% 78%)" : "hsl(220 100% 78%)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i < samples; i += step) {
        const v = ch.data[startIdx + i];
        const norm = ((v - ch.min) / range - 0.5) * 2; // -1..1
        const x = plotLeft + (i / samples) * plotWidth;
        const y = centerY - norm * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // Playhead
    const playheadX = plotLeft + plotWidth / 2;
    ctx.strokeStyle = "hsl(195 100% 78%)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, H);
    ctx.stroke();
    ctx.fillStyle = "hsl(195 100% 78%)";
    ctx.beginPath();
    ctx.arc(playheadX, 8, 4, 0, Math.PI * 2);
    ctx.fill();

    // Time label
    ctx.fillStyle = "hsl(213 45% 97% / 0.9)";
    ctx.font = "700 11px 'SF Pro Display', system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`${currentTime.toFixed(2)}s`, playheadX + 6, 4);
  }, [recording, currentTime, quality, window]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%", display: "block" }} />;
}
