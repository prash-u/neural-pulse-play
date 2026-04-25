import { useId, useMemo, useState } from "react";
import { computeChannelActivities } from "@/lib/eeg/activity";
import type { EEGChannelQuality, EEGBandMode } from "@/lib/eeg/review";
import { resolveElectrodePosition } from "@/lib/eeg/montage";
import type { EEGRecording } from "@/lib/eeg/types";

interface Props {
  recording: EEGRecording;
  currentTime: number;
  isPlaying: boolean;
  mode: "headmap" | "cortical";
  bandMode: EEGBandMode;
  signalGain?: number;
  heatSpread?: number;
  surfaceInset?: number;
  quality?: EEGChannelQuality[];
  showLabels?: boolean;
}

interface ElectrodeVisual {
  label: string;
  channelIdx: number;
  x: number;
  y: number;
}

const VIEWBOX = { width: 100, height: 120 };
const HEAD = { cx: 50, cy: 60, rx: 31.5, ry: 39 };

export function Brain3D({
  recording,
  currentTime,
  isPlaying,
  mode,
  bandMode,
  signalGain = 1.15,
  heatSpread = 1,
  surfaceInset = 0.14,
  quality = [],
  showLabels = false,
}: Props) {
  const gradientNamespace = useId();
  const [hovered, setHovered] = useState<string | null>(null);

  const electrodes = useMemo<ElectrodeVisual[]>(() => {
    const output: ElectrodeVisual[] = [];
    recording.channels.forEach((channel, index) => {
      const position = resolveElectrodePosition(channel.label);
      if (!position) return;
      output.push({
        label: channel.label,
        channelIdx: index,
        ...mapToHead(position),
      });
    });
    return output;
  }, [recording]);

  const activities = useMemo(() => {
    const values = computeChannelActivities(recording, currentTime);
    return electrodes.map((electrode) => ({
      ...electrode,
      activity: clamp01((values[electrode.channelIdx]?.activity ?? 0) * signalGain),
    }));
  }, [currentTime, electrodes, recording, signalGain]);

  const qualityByLabel = useMemo(() => new Map(quality.map((channel) => [channel.label, channel])), [quality]);
  const palette = getBandPalette(bandMode);
  const spreadMultiplier = getBandSpreadMultiplier(bandMode);
  const innerScale = 1 - surfaceInset * 0.32;

  return (
    <div className="relative h-full w-full bg-[#040816]">
      <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="h-full w-full" role="img" aria-label="EEG topographic visualizer">
        <defs>
          <clipPath id={`${gradientNamespace}-head-clip`}>
            <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
          </clipPath>
          <clipPath id={`${gradientNamespace}-cortex-clip`}>
            <path d={getCortexClipPath(innerScale)} />
          </clipPath>
          {activities.map((electrode) => {
            const { glowColor, hotColor } = getHeatColors(palette, electrode.activity);
            const artifact = qualityByLabel.get(electrode.label)?.artifact;
            const color = artifact ? "hsl(32 95% 60%)" : hotColor;
            const radius = getBlobRadius(mode, bandMode, electrode.activity, heatSpread * spreadMultiplier);
            return (
              <radialGradient key={`${gradientNamespace}-${electrode.label}`} id={`${gradientNamespace}-${electrode.label}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={color} stopOpacity={Math.min(0.92, 0.24 + electrode.activity * 0.7)} />
                <stop offset="48%" stopColor={glowColor} stopOpacity={Math.min(0.5, 0.12 + electrode.activity * 0.32)} />
                <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
                <animate
                  attributeName="r"
                  values={`45%;${45 + (isPlaying ? electrode.activity * 8 : 0)}%;45%`}
                  dur={bandMode === "gamma" ? "0.45s" : bandMode === "beta" ? "0.9s" : "1.6s"}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="fy"
                  values={`50%;${50 - (isPlaying ? electrode.activity * 4 : 0)}%;50%`}
                  dur={bandMode === "theta" ? "2.4s" : "1.3s"}
                  repeatCount="indefinite"
                />
              </radialGradient>
            );
          })}
          {activities.map((electrode) => {
            const radius = getBlobRadius(mode, bandMode, electrode.activity, heatSpread * spreadMultiplier);
            return (
              <filter key={`${gradientNamespace}-${electrode.label}-blur`} id={`${gradientNamespace}-${electrode.label}-blur`}>
                <feGaussianBlur stdDeviation={radius * 0.16} />
              </filter>
            );
          })}
        </defs>

        <rect x="0" y="0" width="100" height="120" fill="#040816" />

        {mode === "headmap" ? (
          <>
            <g opacity={0.95}>
              <path d="M50 13 L46.6 20 H53.4 Z" fill="rgba(195,237,255,0.84)" />
              <path d="M17 49 C13 53 13 67 17 71" fill="none" stroke="rgba(195,237,255,0.34)" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M83 49 C87 53 87 67 83 71" fill="none" stroke="rgba(195,237,255,0.34)" strokeWidth="1.4" strokeLinecap="round" />
              <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} fill="rgba(8,16,32,0.84)" stroke="rgba(195,237,255,0.28)" strokeWidth="1.2" />
              <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx - 3.8} ry={HEAD.ry - 4.2} fill="none" stroke="rgba(195,237,255,0.08)" strokeWidth="0.8" />
            </g>

            <g clipPath={`url(#${gradientNamespace}-head-clip)`}>
              {activities.map((electrode) => (
                <circle
                  key={`${electrode.label}-blob`}
                  cx={electrode.x}
                  cy={electrode.y}
                  r={getBlobRadius(mode, bandMode, electrode.activity, heatSpread * spreadMultiplier)}
                  fill={`url(#${gradientNamespace}-${electrode.label})`}
                  filter={`url(#${gradientNamespace}-${electrode.label}-blur)`}
                />
              ))}
            </g>
          </>
        ) : (
          <>
            <g opacity={0.98}>
              <path d={getCortexSurfacePath(1)} fill="rgba(16,24,44,0.88)" stroke="rgba(195,237,255,0.2)" strokeWidth="1.1" />
              <path d={getCortexSurfacePath(innerScale)} fill="rgba(12,20,38,0.38)" stroke="rgba(195,237,255,0.08)" strokeWidth="0.8" />
              <path d="M50 17 C49 28 49 40 50 52 C51 63 51 74 50 89" fill="none" stroke="rgba(195,237,255,0.12)" strokeWidth="0.9" strokeLinecap="round" />
              <path d="M36 28 C30 38 30 54 36 66" fill="none" stroke="rgba(195,237,255,0.08)" strokeWidth="0.7" strokeLinecap="round" />
              <path d="M64 28 C70 38 70 54 64 66" fill="none" stroke="rgba(195,237,255,0.08)" strokeWidth="0.7" strokeLinecap="round" />
            </g>

            <g clipPath={`url(#${gradientNamespace}-cortex-clip)`}>
              {activities.map((electrode) => (
                <circle
                  key={`${electrode.label}-blob`}
                  cx={electrode.x}
                  cy={electrode.y}
                  r={getBlobRadius(mode, bandMode, electrode.activity, heatSpread * spreadMultiplier)}
                  fill={`url(#${gradientNamespace}-${electrode.label})`}
                  filter={`url(#${gradientNamespace}-${electrode.label}-blur)`}
                />
              ))}
            </g>
          </>
        )}

        {activities.map((electrode) => {
          const artifact = qualityByLabel.get(electrode.label)?.artifact;
          const labelVisible = showLabels || hovered === electrode.label;
          return (
            <g
              key={electrode.label}
              onMouseEnter={() => setHovered(electrode.label)}
              onMouseLeave={() => setHovered((current) => current === electrode.label ? null : current)}
            >
              <circle
                cx={electrode.x}
                cy={electrode.y}
                r={mode === "headmap" ? 1.45 : 1.15}
                fill={artifact ? "hsl(32 95% 60%)" : "rgba(230,242,255,0.95)"}
                stroke={artifact ? "rgba(255,140,64,0.9)" : "rgba(7,14,25,0.92)"}
                strokeWidth={artifact ? 0.8 : 0.55}
              />
              {labelVisible ? (
                <>
                  <rect
                    x={electrode.x - 5.8}
                    y={electrode.y - 8.9}
                    width="11.6"
                    height="4.5"
                    rx="2.1"
                    fill="rgba(6,10,20,0.86)"
                    stroke="rgba(195,237,255,0.15)"
                    strokeWidth="0.2"
                  />
                  <text
                    x={electrode.x}
                    y={electrode.y - 5.8}
                    textAnchor="middle"
                    fontSize="2.5"
                    fontWeight="700"
                    fill="rgba(236,244,255,0.95)"
                  >
                    {cleanLabel(electrode.label)}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function mapToHead(position: [number, number, number]) {
  const [x, y, z] = position;
  return {
    x: 50 + x * 31.5,
    y: 60 - z * 37 - y * 4.5,
  };
}

function getBandPalette(bandMode: EEGBandMode) {
  switch (bandMode) {
    case "delta":
      return { cool: "hsl(215 100% 66%)", hot: "hsl(195 100% 74%)" };
    case "theta":
      return { cool: "hsl(258 82% 68%)", hot: "hsl(220 100% 72%)" };
    case "alpha":
      return { cool: "hsl(188 100% 68%)", hot: "hsl(172 100% 72%)" };
    case "beta":
      return { cool: "hsl(164 88% 58%)", hot: "hsl(52 100% 64%)" };
    case "gamma":
      return { cool: "hsl(330 90% 68%)", hot: "hsl(8 100% 64%)" };
    default:
      return { cool: "hsl(195 100% 74%)", hot: "hsl(330 88% 72%)" };
  }
}

function getHeatColors(
  palette: { cool: string; hot: string },
  activity: number,
) {
  return {
    glowColor: activity < 0.55 ? palette.cool : palette.hot,
    hotColor: activity < 0.8 ? palette.hot : "hsl(8 100% 68%)",
  };
}

function getBandSpreadMultiplier(bandMode: EEGBandMode) {
  switch (bandMode) {
    case "delta":
      return 1.26;
    case "theta":
      return 1.14;
    case "alpha":
      return 1;
    case "beta":
      return 0.92;
    case "gamma":
      return 0.78;
    default:
      return 1;
  }
}

function getBlobRadius(
  mode: "headmap" | "cortical",
  bandMode: EEGBandMode,
  activity: number,
  spread: number,
) {
  const base = mode === "headmap" ? 8.5 : 6.2;
  const bandBase = bandMode === "delta" ? 2.2 : bandMode === "gamma" ? -0.8 : 0;
  return (base + bandBase + activity * (mode === "headmap" ? 10.5 : 8.5)) * spread;
}

function getCortexSurfacePath(scale: number) {
  const left = [
    `M ${50 - 24 * scale} ${22 + 4 * (1 - scale)}`,
    `C ${50 - 36 * scale} ${31 + 2 * (1 - scale)}, ${50 - 34 * scale} ${79 - 4 * (1 - scale)}, ${50 - 16 * scale} ${91 - 2 * (1 - scale)}`,
    `C ${50 - 6 * scale} ${96 - 1 * (1 - scale)}, ${50 - 3 * scale} ${76}, ${50 - 4 * scale} ${56}`,
    `C ${50 - 5 * scale} ${37}, ${50 - 9 * scale} ${26}, ${50 - 24 * scale} ${22 + 4 * (1 - scale)}`,
  ].join(" ");
  const right = [
    `M ${50 + 24 * scale} ${22 + 4 * (1 - scale)}`,
    `C ${50 + 36 * scale} ${31 + 2 * (1 - scale)}, ${50 + 34 * scale} ${79 - 4 * (1 - scale)}, ${50 + 16 * scale} ${91 - 2 * (1 - scale)}`,
    `C ${50 + 6 * scale} ${96 - 1 * (1 - scale)}, ${50 + 3 * scale} ${76}, ${50 + 4 * scale} ${56}`,
    `C ${50 + 5 * scale} ${37}, ${50 + 9 * scale} ${26}, ${50 + 24 * scale} ${22 + 4 * (1 - scale)}`,
  ].join(" ");
  return `${left} ${right}`;
}

function getCortexClipPath(scale: number) {
  return getCortexSurfacePath(scale);
}

function cleanLabel(label: string) {
  return label.replace(/-REF|EEG /gi, "").slice(0, 8);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
