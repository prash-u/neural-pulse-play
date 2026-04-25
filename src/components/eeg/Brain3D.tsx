import { useEffect, useId, useMemo, useState } from "react";
import { Maximize2, Move, RefreshCcw, ZoomIn } from "lucide-react";
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
  lateral: number;
  depth: number;
}

type CortexView = "top" | "left" | "right" | "front" | "back";

const VIEWBOX = { width: 100, height: 120 };
const HEAD = { cx: 50, cy: 60, rx: 31.5, ry: 39 };
const CORTEX_VIEWS: CortexView[] = ["top", "left", "right", "front", "back"];

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
  const [cortexView, setCortexView] = useState<CortexView>("top");
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    if (mode !== "cortical" || !autoRotate) return;
    const timer = window.setInterval(() => {
      setCortexView((current) => CORTEX_VIEWS[(CORTEX_VIEWS.indexOf(current) + 1) % CORTEX_VIEWS.length]);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [autoRotate, mode]);

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
  const cortexProjection = getCorticalProjection(cortexView, surfaceInset);
  const legendLabel = getLegendLabel(bandMode);

  return (
    <div className="relative h-full w-full bg-[#040816]">
      <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="h-full w-full" role="img" aria-label="EEG topographic visualizer">
        <defs>
          <clipPath id={`${gradientNamespace}-head-clip`}>
            <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
          </clipPath>

          <clipPath id={`${gradientNamespace}-brain-surface-clip`}>
            <path d={cortexProjection.shellPath} />
          </clipPath>

          <linearGradient id={`${gradientNamespace}-bg-glow`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(84,161,255,0.14)" />
            <stop offset="50%" stopColor="rgba(19,28,52,0.1)" />
            <stop offset="100%" stopColor="rgba(4,8,22,0)" />
          </linearGradient>

          <linearGradient id={`${gradientNamespace}-brain-shade`} x1="10%" y1="5%" x2="90%" y2="95%">
            <stop offset="0%" stopColor="rgba(219,236,255,0.3)" />
            <stop offset="16%" stopColor="rgba(78,118,182,0.18)" />
            <stop offset="55%" stopColor="rgba(25,38,72,0.08)" />
            <stop offset="100%" stopColor="rgba(3,8,20,0.66)" />
          </linearGradient>

          <linearGradient id={`${gradientNamespace}-brain-rim`} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="rgba(126,164,255,0.14)" />
            <stop offset="45%" stopColor="rgba(225,236,255,0.2)" />
            <stop offset="100%" stopColor="rgba(90,128,198,0.1)" />
          </linearGradient>

          <linearGradient id={`${gradientNamespace}-power-scale`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="hsl(222 70% 46%)" />
            <stop offset="28%" stopColor="hsl(193 82% 56%)" />
            <stop offset="54%" stopColor="hsl(55 95% 63%)" />
            <stop offset="78%" stopColor="hsl(28 100% 60%)" />
            <stop offset="100%" stopColor="hsl(5 100% 62%)" />
          </linearGradient>

          {activities.map((electrode) => {
            const projected = projectElectrode(electrode, cortexView);
            const heat = getContinuousHeatColor(projected.activity, palette);
            const artifact = qualityByLabel.get(electrode.label)?.artifact;
            const hotColor = artifact ? "hsl(33 95% 60%)" : heat.core;
            const glowColor = artifact ? "hsl(20 95% 58%)" : heat.glow;
            return (
              <radialGradient
                key={`${gradientNamespace}-${electrode.label}`}
                id={`${gradientNamespace}-${electrode.label}`}
                cx="50%"
                cy="50%"
                r="50%"
              >
                <stop offset="0%" stopColor={hotColor} stopOpacity={Math.min(0.98, 0.34 + projected.activity * 0.66)} />
                <stop offset="32%" stopColor={hotColor} stopOpacity={Math.min(0.82, 0.18 + projected.activity * 0.54)} />
                <stop offset="68%" stopColor={glowColor} stopOpacity={Math.min(0.42, 0.08 + projected.activity * 0.28)} />
                <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
              </radialGradient>
            );
          })}
          {activities.map((electrode) => {
            const projected = projectElectrode(electrode, cortexView);
            const radius = getBlobRadius(mode, bandMode, projected.activity, heatSpread * spreadMultiplier, cortexView);
            return (
              <filter key={`${gradientNamespace}-${electrode.label}-blur`} id={`${gradientNamespace}-${electrode.label}-blur`}>
                <feGaussianBlur stdDeviation={radius * 0.13} />
              </filter>
            );
          })}
        </defs>

        <rect x="0" y="0" width="100" height="120" fill="#040816" />
        <rect x="0" y="0" width="100" height="120" fill={`url(#${gradientNamespace}-bg-glow)`} />

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
                  r={getBlobRadius(mode, bandMode, electrode.activity, heatSpread * spreadMultiplier, cortexView)}
                  fill={`url(#${gradientNamespace}-${electrode.label})`}
                  filter={`url(#${gradientNamespace}-${electrode.label}-blur)`}
                />
              ))}
            </g>
          </>
        ) : (
          <>
            <g>
              <path d={cortexProjection.shadowPath} fill="rgba(3,7,18,0.52)" />
              <path d={cortexProjection.shellPath} fill="rgba(15,22,38,0.9)" stroke="rgba(196,225,255,0.18)" strokeWidth="0.7" />
              <path d={cortexProjection.highlightPath} fill={`url(#${gradientNamespace}-brain-shade)`} opacity="0.9" />
              <path d={cortexProjection.rimPath} fill="none" stroke={`url(#${gradientNamespace}-brain-rim)`} strokeWidth="1.2" strokeLinecap="round" />
              {cortexProjection.gyriPaths.map((path, index) => (
                <path
                  key={path}
                  d={path}
                  fill="none"
                  stroke={index % 3 === 0 ? "rgba(205,228,255,0.14)" : "rgba(155,188,255,0.08)"}
                  strokeWidth={index % 2 === 0 ? 0.92 : 0.68}
                  strokeLinecap="round"
                />
              ))}
            </g>

            <g clipPath={`url(#${gradientNamespace}-brain-surface-clip)`}>
              {activities
                .map((electrode) => ({ ...projectElectrode(electrode, cortexView), label: electrode.label }))
                .sort((a, b) => a.depth - b.depth)
                .map((electrode) => (
                  <circle
                    key={`${electrode.label}-blob`}
                    cx={electrode.x}
                    cy={electrode.y}
                    r={getBlobRadius(mode, bandMode, electrode.activity, heatSpread * spreadMultiplier, cortexView)}
                    fill={`url(#${gradientNamespace}-${electrode.label})`}
                    filter={`url(#${gradientNamespace}-${electrode.label}-blur)`}
                    opacity={0.96}
                  />
                ))}
              <rect x="0" y="0" width="100" height="120" fill="rgba(12,16,30,0.06)" />
            </g>
          </>
        )}

        {activities
          .map((electrode) => projectElectrode(electrode, mode === "cortical" ? cortexView : "top"))
          .filter((electrode) => mode === "headmap" || electrode.visible)
          .sort((a, b) => a.depth - b.depth)
          .map((electrode) => {
            const artifact = qualityByLabel.get(electrode.label)?.artifact;
            const labelVisible = showLabels || hovered === electrode.label;
            return (
              <g
                key={electrode.label}
                onMouseEnter={() => setHovered(electrode.label)}
                onMouseLeave={() => setHovered((current) => (current === electrode.label ? null : current))}
              >
                <circle
                  cx={electrode.x}
                  cy={electrode.y}
                  r={mode === "headmap" ? 1.45 : 1.22 + electrode.activity * 0.28}
                  fill={artifact ? "hsl(32 95% 60%)" : "rgba(236,244,255,0.96)"}
                  stroke={artifact ? "rgba(255,140,64,0.92)" : "rgba(7,14,25,0.92)"}
                  strokeWidth={artifact ? 0.8 : 0.55}
                  opacity={mode === "headmap" ? 1 : 0.84 + electrode.activity * 0.12}
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

      {mode === "cortical" ? (
        <>
          <div className="pointer-events-none absolute left-4 top-4 max-w-[16rem]">
            <div className="rounded-[1.2rem] border border-white/10 bg-[rgba(5,11,24,0.72)] px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <p className="eyebrow">Topographic view</p>
              <h3 className="mt-1 text-[1.02rem] font-semibold text-foreground">Cortical surface map</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Interpolated cortical activity in the current band with viewpoint-aware electrode projection.
              </p>
            </div>
          </div>

          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <div className="grid gap-2 rounded-[1.1rem] border border-white/10 bg-[rgba(5,11,24,0.72)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              {[RefreshCcw, Move, ZoomIn, Maximize2].map((Icon, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    if (index === 0) setCortexView("top");
                    if (index === 1) setAutoRotate((value) => !value);
                    if (index === 2) setCortexView((current) => (current === "left" ? "right" : "left"));
                    if (index === 3) setShowLabelsFallback(showLabels, setHovered, activities);
                  }}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/8 bg-white/4 text-[rgba(219,232,255,0.88)] transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                  aria-label={index === 0 ? "Reset view" : index === 1 ? "Toggle rotation" : index === 2 ? "Flip hemisphere" : "Preview labels"}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-5 right-6 flex items-end gap-3">
            <div className="pb-1 text-right text-[11px] text-muted-foreground">
              <div className="font-medium text-foreground">{legendLabel}</div>
              <div>Power map</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Low</span>
              <div className="h-28 w-4 rounded-full border border-white/10 bg-[rgba(7,13,26,0.72)] p-[2px]">
                <div
                  className="h-full w-full rounded-full"
                  style={{
                    background:
                      "linear-gradient(180deg, hsl(5 100% 62%), hsl(28 100% 60%), hsl(55 95% 63%), hsl(193 82% 56%), hsl(222 70% 46%))",
                  }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground">High</span>
            </div>
          </div>

          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-[1.1rem] border border-white/10 bg-[rgba(5,11,24,0.76)] px-3 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              {CORTEX_VIEWS.map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setCortexView(view)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    cortexView === view ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {view[0].toUpperCase() + view.slice(1)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAutoRotate((value) => !value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                autoRotate ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground"
              }`}
            >
              3D Rotate {autoRotate ? "On" : "Off"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function mapToHead(position: [number, number, number]) {
  const [x, y, z] = position;
  return {
    x: 50 + x * 31.5,
    y: 60 - z * 37 - y * 4.5,
    lateral: x,
    depth: y,
  };
}

function projectElectrode(electrode: ElectrodeVisual & { activity: number }, view: CortexView) {
  if (view === "top") {
    return { ...electrode, visible: true };
  }

  if (view === "left") {
    return {
      ...electrode,
      x: 56 + electrode.depth * 7 - Math.max(0, electrode.lateral) * 8,
      y: 64 - electrode.y * 0.72 + electrode.lateral * 2.5,
      depth: 1 - Math.max(-1, Math.min(1, -electrode.lateral)),
      visible: electrode.lateral <= 0.24,
    };
  }

  if (view === "right") {
    return {
      ...electrode,
      x: 44 - electrode.depth * 7 + Math.min(0, electrode.lateral) * 8,
      y: 64 - electrode.y * 0.72 - electrode.lateral * 2.5,
      depth: 1 - Math.max(-1, Math.min(1, electrode.lateral)),
      visible: electrode.lateral >= -0.24,
    };
  }

  if (view === "front") {
    return {
      ...electrode,
      x: 50 + electrode.lateral * 18,
      y: 62 - (electrode.depth + 0.2) * 26 - (60 - electrode.y) * 0.34,
      depth: 1 - electrode.depth,
      visible: electrode.depth <= 0.48,
    };
  }

  return {
    ...electrode,
    x: 50 - electrode.lateral * 18,
    y: 70 + (electrode.depth - 0.05) * 16 - (60 - electrode.y) * 0.28,
    depth: 1 + electrode.depth,
    visible: electrode.depth >= -0.25,
  };
}

function getBandPalette(bandMode: EEGBandMode) {
  switch (bandMode) {
    case "delta":
      return ["hsl(223 74% 46%)", "hsl(205 82% 57%)", "hsl(188 86% 66%)", "hsl(198 88% 74%)"];
    case "theta":
      return ["hsl(231 67% 49%)", "hsl(262 76% 62%)", "hsl(214 90% 71%)", "hsl(193 94% 74%)"];
    case "alpha":
      return ["hsl(217 58% 44%)", "hsl(187 68% 58%)", "hsl(54 95% 64%)", "hsl(11 94% 60%)"];
    case "beta":
      return ["hsl(182 66% 41%)", "hsl(154 72% 49%)", "hsl(54 95% 63%)", "hsl(28 100% 59%)"];
    case "gamma":
      return ["hsl(266 64% 44%)", "hsl(338 78% 56%)", "hsl(26 100% 61%)", "hsl(3 100% 62%)"];
    default:
      return ["hsl(221 66% 45%)", "hsl(194 78% 57%)", "hsl(54 95% 64%)", "hsl(6 98% 62%)"];
  }
}

function getContinuousHeatColor(activity: number, palette: string[]) {
  if (activity < 0.28) return { glow: palette[0], core: palette[1] };
  if (activity < 0.58) return { glow: palette[1], core: palette[2] };
  if (activity < 0.82) return { glow: palette[2], core: palette[3] };
  return { glow: palette[2], core: "hsl(5 100% 64%)" };
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
  view: CortexView,
) {
  if (mode === "headmap") {
    const bandBase = bandMode === "delta" ? 2.2 : bandMode === "gamma" ? -0.8 : 0;
    return (8.5 + bandBase + activity * 10.5) * spread;
  }

  const viewScale = view === "top" ? 0.92 : view === "front" || view === "back" ? 0.82 : 0.88;
  const bandBase = bandMode === "delta" ? 1.6 : bandMode === "gamma" ? -0.7 : 0;
  return (7 + bandBase + activity * 8.6) * spread * viewScale;
}

function getCorticalProjection(view: CortexView, surfaceInset: number) {
  const inset = 1 - surfaceInset * 0.3;

  if (view === "left") {
    return {
      shellPath: ellipsePath(52, 67, 26 * inset, 34.5 * inset),
      shadowPath: ellipsePath(55, 72, 22.5 * inset, 10.5 * inset),
      highlightPath: blobPath(50, 65, 24 * inset, 31.5 * inset, -2),
      rimPath: arcPath(52, 66.5, 24.8 * inset, 33 * inset),
      gyriPaths: generateGyriPaths(view, inset),
    };
  }

  if (view === "right") {
    return {
      shellPath: ellipsePath(48, 67, 26 * inset, 34.5 * inset),
      shadowPath: ellipsePath(45, 72, 22.5 * inset, 10.5 * inset),
      highlightPath: blobPath(50, 65, 24 * inset, 31.5 * inset, 2),
      rimPath: arcPath(48, 66.5, 24.8 * inset, 33 * inset),
      gyriPaths: generateGyriPaths(view, inset),
    };
  }

  if (view === "front") {
    return {
      shellPath: ellipsePath(50, 66, 22.5 * inset, 34 * inset),
      shadowPath: ellipsePath(50, 74, 18.5 * inset, 8.5 * inset),
      highlightPath: blobPath(50, 65, 19.5 * inset, 30 * inset, 0),
      rimPath: arcPath(50, 66, 21.8 * inset, 31 * inset),
      gyriPaths: generateGyriPaths(view, inset),
    };
  }

  if (view === "back") {
    return {
      shellPath: ellipsePath(50, 71, 22 * inset, 29.5 * inset),
      shadowPath: ellipsePath(50, 78, 18 * inset, 8 * inset),
      highlightPath: blobPath(50, 70, 18.5 * inset, 25 * inset, 0),
      rimPath: arcPath(50, 70, 20 * inset, 27.5 * inset),
      gyriPaths: generateGyriPaths(view, inset),
    };
  }

  return {
    shellPath: topHemispherePath(inset),
    shadowPath: ellipsePath(50, 85, 23 * inset, 8 * inset),
    highlightPath: blobPath(50, 61, 25 * inset, 29.5 * inset, 0),
    rimPath: topHemisphereRim(inset),
    gyriPaths: generateGyriPaths(view, inset),
  };
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 -${rx * 2} 0`;
}

function arcPath(cx: number, cy: number, rx: number, ry: number) {
  return `M ${cx - rx} ${cy + 1} C ${cx - rx * 0.62} ${cy - ry}, ${cx + rx * 0.4} ${cy - ry * 0.92}, ${cx + rx} ${cy - 2}`;
}

function blobPath(cx: number, cy: number, rx: number, ry: number, skew: number) {
  return [
    `M ${cx - rx * 0.88} ${cy - ry * 0.2}`,
    `C ${cx - rx * 0.78} ${cy - ry * 0.94}, ${cx + skew} ${cy - ry * 1.1}, ${cx + rx * 0.72} ${cy - ry * 0.34}`,
    `C ${cx + rx * 0.9} ${cy + ry * 0.16}, ${cx + rx * 0.24} ${cy + ry * 0.96}, ${cx - rx * 0.44} ${cy + ry * 0.64}`,
    `C ${cx - rx * 0.86} ${cy + ry * 0.3}, ${cx - rx * 1.02} ${cy + ry * 0.12}, ${cx - rx * 0.88} ${cy - ry * 0.2}`,
  ].join(" ");
}

function topHemispherePath(scale: number) {
  return [
    `M ${50 - 29 * scale} ${73}`,
    `C ${50 - 34 * scale} ${52}, ${50 - 20 * scale} ${26}, ${50 - 2} ${23}`,
    `C ${50 + 16 * scale} ${20}, ${50 + 32 * scale} ${33}, ${50 + 30 * scale} ${58}`,
    `C ${50 + 28 * scale} ${78}, ${50 + 16 * scale} ${97}, ${50 - 3} ${100}`,
    `C ${50 - 18 * scale} ${101}, ${50 - 30 * scale} ${89}, ${50 - 29 * scale} ${73}`,
  ].join(" ");
}

function topHemisphereRim(scale: number) {
  return `M ${50 - 28 * scale} 74 C ${50 - 28 * scale} 42, ${50 + 28 * scale} 26, ${50 + 28 * scale} 69`;
}

function generateGyriPaths(view: CortexView, inset: number) {
  if (view === "top") {
    return [
      curvedLine(27, 76, 34, 44, 36, 36, 45, 25),
      curvedLine(31, 84, 37, 61, 39, 44, 47, 34),
      curvedLine(35, 92, 42, 72, 45, 51, 49, 39),
      curvedLine(46, 98, 47, 75, 50, 52, 51, 24),
      curvedLine(57, 97, 56, 74, 55, 51, 53, 25),
      curvedLine(66, 92, 61, 70, 58, 50, 55, 36),
      curvedLine(72, 83, 65, 60, 61, 43, 56, 32),
      curvedLine(73, 70, 67, 51, 61, 36, 57, 28),
      curvedLine(39, 59, 44, 57, 49, 56, 60, 57),
      curvedLine(37, 69, 44, 66, 52, 66, 64, 68),
      curvedLine(34, 80, 43, 78, 55, 79, 66, 82),
      curvedLine(41, 48, 46, 46, 52, 46, 58, 48),
    ].map((curve) => scaleCurve(curve, inset, 50, 62));
  }

  if (view === "left" || view === "right") {
    return [
      curvedLine(36, 49, 42, 38, 54, 34, 70, 42),
      curvedLine(31, 58, 41, 48, 57, 47, 74, 54),
      curvedLine(28, 67, 39, 58, 56, 58, 73, 64),
      curvedLine(27, 77, 38, 71, 56, 69, 71, 72),
      curvedLine(28, 87, 39, 82, 54, 78, 67, 79),
      curvedLine(37, 96, 46, 92, 57, 89, 64, 85),
      curvedLine(47, 43, 49, 52, 50, 63, 48, 73),
      curvedLine(56, 41, 58, 52, 59, 64, 58, 76),
    ].map((curve) => scaleCurve(curve, inset, 50, 67));
  }

  if (view === "front") {
    return [
      curvedLine(34, 49, 40, 36, 46, 30, 50, 26),
      curvedLine(66, 49, 60, 36, 54, 30, 50, 26),
      curvedLine(36, 63, 41, 55, 45, 48, 49, 40),
      curvedLine(64, 63, 59, 55, 55, 48, 51, 40),
      curvedLine(40, 79, 44, 72, 47, 64, 49, 55),
      curvedLine(60, 79, 56, 72, 53, 64, 51, 55),
      curvedLine(45, 92, 48, 81, 50, 69, 51, 56),
      curvedLine(55, 92, 52, 81, 50, 69, 49, 56),
    ].map((curve) => scaleCurve(curve, inset, 50, 66));
  }

  return [
    curvedLine(35, 60, 40, 54, 46, 50, 50, 47),
    curvedLine(65, 60, 60, 54, 54, 50, 50, 47),
    curvedLine(38, 74, 42, 68, 46, 63, 50, 58),
    curvedLine(62, 74, 58, 68, 54, 63, 50, 58),
    curvedLine(44, 86, 47, 77, 49, 69, 50, 61),
    curvedLine(56, 86, 53, 77, 51, 69, 50, 61),
  ].map((curve) => scaleCurve(curve, inset, 50, 71));
}

function curvedLine(x1: number, y1: number, cx1: number, cy1: number, cx2: number, cy2: number, x2: number, y2: number) {
  return [
    [x1, y1],
    [cx1, cy1],
    [cx2, cy2],
    [x2, y2],
  ] as const;
}

function scaleCurve(
  points: readonly (readonly [number, number])[],
  scale: number,
  cx: number,
  cy: number,
) {
  const scaled = points.map(([x, y]) => [
    cx + (x - cx) * scale,
    cy + (y - cy) * scale,
  ]);
  const [[x1, y1], [cx1, cy1], [cx2, cy2], [x2, y2]] = scaled;
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

function getLegendLabel(bandMode: EEGBandMode) {
  switch (bandMode) {
    case "delta":
      return "Delta field";
    case "theta":
      return "Theta drift";
    case "alpha":
      return "Alpha power";
    case "beta":
      return "Beta power";
    case "gamma":
      return "Gamma spikes";
    default:
      return "Broadband power";
  }
}

function setShowLabelsFallback(
  showLabels: boolean,
  setHovered: (value: string | null | ((current: string | null) => string | null)) => void,
  activities: Array<{ label: string }>,
) {
  if (showLabels) return;
  setHovered(activities[0]?.label ?? null);
  window.setTimeout(() => setHovered(null), 1500);
}

function cleanLabel(label: string) {
  return label.replace(/-REF|EEG /gi, "").slice(0, 8);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
