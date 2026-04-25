import { useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
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

interface CorticalElectrode {
  label: string;
  activity: number;
  artifact: boolean;
  position: THREE.Vector3;
  normal: THREE.Vector3;
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

  if (mode === "cortical") {
    const corticalElectrodes = activities.map((electrode) => {
      const position3D = resolveElectrodePosition(electrode.label) ?? [0, 0, 0];
      const projected = projectToCortex(position3D, surfaceInset);
      return {
        label: electrode.label,
        activity: electrode.activity,
        artifact: qualityByLabel.get(electrode.label)?.artifact ?? false,
        position: projected.position,
        normal: projected.normal,
      };
    });

    return (
      <div className="relative h-full w-full overflow-hidden bg-[#040816]">
        <Canvas camera={{ position: [0, 0.35, 4.4], fov: 34 }} dpr={[1, 1.8]}>
          <color attach="background" args={["#040816"]} />
          <fog attach="fog" args={["#040816", 4.4, 7.4]} />
          <ambientLight intensity={0.85} color="#9bc6ff" />
          <directionalLight position={[2.8, 3.2, 2.2]} intensity={1.4} color="#d9eeff" />
          <directionalLight position={[-2.6, 1.4, -2.8]} intensity={0.55} color="#4c7dff" />
          <pointLight position={[0, -2.8, 2.2]} intensity={0.45} color="#6fe2ff" />

          <group position={[0, -0.12, 0]} rotation={[-0.08, 0, 0]}>
            <CorticalBrainMesh bandMode={bandMode} electrodes={corticalElectrodes} />
            <CorticalElectrodes
              electrodes={corticalElectrodes}
              showLabels={showLabels}
              hovered={hovered}
              setHovered={setHovered}
              heatSpread={heatSpread * spreadMultiplier}
              isPlaying={isPlaying}
            />
          </group>

          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={3}
            maxDistance={6}
            minPolarAngle={0.7}
            maxPolarAngle={2.35}
            rotateSpeed={0.8}
            zoomSpeed={0.85}
          />
        </Canvas>

        <div className="pointer-events-none absolute left-4 top-4 max-w-[18rem]">
          <div className="rounded-[1.2rem] border border-white/10 bg-[rgba(5,11,24,0.74)] px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <p className="eyebrow">Topographic view</p>
            <h3 className="mt-1 text-[1.02rem] font-semibold text-foreground">3D cortical surface</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Drag to rotate the cortex. Electrode glow now follows the live EEG frame and stays stable when paused.
            </p>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-5 right-5 flex items-end gap-3">
          <div className="pb-1 text-right text-[11px] text-muted-foreground">
            <div className="font-medium text-foreground">{getLegendLabel(bandMode)}</div>
            <div>Signal power</div>
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
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#040816]">
      <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="h-full w-full" role="img" aria-label="EEG topographic visualizer">
        <defs>
          <clipPath id={`${gradientNamespace}-head-clip`}>
            <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
          </clipPath>
          {activities.map((electrode) => {
            const heat = getContinuousHeatColor(electrode.activity, palette);
            const artifact = qualityByLabel.get(electrode.label)?.artifact;
            const hotColor = artifact ? "hsl(33 95% 60%)" : heat.core;
            const glowColor = artifact ? "hsl(20 95% 58%)" : heat.glow;
            return (
              <radialGradient key={`${gradientNamespace}-${electrode.label}`} id={`${gradientNamespace}-${electrode.label}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={hotColor} stopOpacity={Math.min(0.98, 0.34 + electrode.activity * 0.66)} />
                <stop offset="32%" stopColor={hotColor} stopOpacity={Math.min(0.82, 0.18 + electrode.activity * 0.54)} />
                <stop offset="68%" stopColor={glowColor} stopOpacity={Math.min(0.42, 0.08 + electrode.activity * 0.28)} />
                <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
              </radialGradient>
            );
          })}
          {activities.map((electrode) => {
            const radius = getHeadBlobRadius(bandMode, electrode.activity, heatSpread * spreadMultiplier);
            return (
              <filter key={`${gradientNamespace}-${electrode.label}-blur`} id={`${gradientNamespace}-${electrode.label}-blur`}>
                <feGaussianBlur stdDeviation={radius * 0.16} />
              </filter>
            );
          })}
        </defs>

        <rect x="0" y="0" width="100" height="120" fill="#040816" />
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
              r={getHeadBlobRadius(bandMode, electrode.activity, heatSpread * spreadMultiplier)}
              fill={`url(#${gradientNamespace}-${electrode.label})`}
              filter={`url(#${gradientNamespace}-${electrode.label}-blur)`}
            />
          ))}
        </g>

        {activities.map((electrode) => {
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
                r={1.45}
                fill={artifact ? "hsl(32 95% 60%)" : "rgba(236,244,255,0.96)"}
                stroke={artifact ? "rgba(255,140,64,0.92)" : "rgba(7,14,25,0.92)"}
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

function CorticalBrainMesh({
  bandMode,
  electrodes,
}: {
  bandMode: EEGBandMode;
  electrodes: CorticalElectrode[];
}) {
  const geometry = useMemo(() => {
    const base = new THREE.SphereGeometry(1.28, 128, 128);
    const position = base.attributes.position;
    const colorArray = new Float32Array(position.count * 3);
    const palette = getBandPalette(bandMode);

    for (let index = 0; index < position.count; index += 1) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, index);
      const normal = vertex.clone().normalize();

      const foldA = Math.sin(normal.y * 18) * 0.06;
      const foldB = Math.cos((normal.x + normal.z) * 14) * 0.045;
      const foldC = Math.sin((normal.x * 9) - (normal.z * 11)) * 0.03;
      const cerebellum = normal.z < -0.45 && normal.y < -0.05 ? 0.12 : 0;
      const scale = 1 + foldA + foldB + foldC - cerebellum * 0.35;

      vertex.x *= 1.12 * scale;
      vertex.y *= 0.92 * (1 + foldB * 0.45);
      vertex.z *= 1.28 * (1 + foldA * 0.22);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);

      const activity = sampleCorticalField(vertex, electrodes);
      const color = new THREE.Color(getContinuousHeatColor(activity, palette).core);
      const cool = new THREE.Color("#213454");
      color.lerp(cool, Math.max(0, 0.58 - activity) * 0.9);

      colorArray[index * 3] = color.r;
      colorArray[index * 3 + 1] = color.g;
      colorArray[index * 3 + 2] = color.b;
    }

    base.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
    position.needsUpdate = true;
    base.computeVertexNormals();
    return base;
  }, [bandMode, electrodes]);

  return (
    <>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.48}
          metalness={0.06}
          clearcoat={0.65}
          clearcoatRoughness={0.45}
          sheen={0.35}
          sheenColor="#9fc0ff"
        />
      </mesh>
      <mesh position={[0, -0.96, -0.56]} scale={[0.76, 0.34, 0.5]}>
        <sphereGeometry args={[0.72, 42, 42]} />
        <meshStandardMaterial color="#4b628f" roughness={0.7} metalness={0.04} transparent opacity={0.72} />
      </mesh>
    </>
  );
}

function CorticalElectrodes({
  electrodes,
  showLabels,
  hovered,
  setHovered,
  heatSpread,
  isPlaying,
}: {
  electrodes: CorticalElectrode[];
  showLabels: boolean;
  hovered: string | null;
  setHovered: Dispatch<SetStateAction<string | null>>;
  heatSpread: number;
  isPlaying: boolean;
}) {
  return (
    <>
      {electrodes.map((electrode) => {
        const markerPosition = electrode.position.clone().add(electrode.normal.clone().multiplyScalar(0.02));
        const sunkenPosition = electrode.position.clone().add(electrode.normal.clone().multiplyScalar(-0.045));
        const glowScale = 0.1 + electrode.activity * 0.16 * heatSpread;
        const artifactColor = "#ffac52";
        const glowColor = electrode.artifact ? artifactColor : getGlowHex(electrode.activity);
        const labelVisible = showLabels || hovered === electrode.label;

        return (
          <group
            key={electrode.label}
            position={sunkenPosition}
            onPointerOver={() => setHovered(electrode.label)}
            onPointerOut={() => setHovered((current) => (current === electrode.label ? null : current))}
          >
            <mesh scale={[glowScale, glowScale, glowScale]}>
              <sphereGeometry args={[1, 18, 18]} />
              <meshBasicMaterial color={glowColor} transparent opacity={0.12 + electrode.activity * 0.22} depthWrite={false} />
            </mesh>

            <mesh position={markerPosition.clone().sub(sunkenPosition)} scale={[0.036 + electrode.activity * 0.018, 0.036 + electrode.activity * 0.018, 0.036 + electrode.activity * 0.018]}>
              <sphereGeometry args={[1, 18, 18]} />
              <meshStandardMaterial
                color={electrode.artifact ? artifactColor : "#eef4ff"}
                emissive={electrode.artifact ? artifactColor : glowColor}
                emissiveIntensity={0.45 + electrode.activity * (isPlaying ? 1.6 : 1.1)}
                roughness={0.22}
                metalness={0.08}
              />
            </mesh>

            {labelVisible ? (
              <Html position={markerPosition.clone().sub(sunkenPosition).add(new THREE.Vector3(0, 0.12, 0))} center distanceFactor={8.5}>
                <div className="rounded-full border border-white/10 bg-[rgba(6,10,20,0.82)] px-2 py-1 text-[10px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                  {cleanLabel(electrode.label)}
                </div>
              </Html>
            ) : null}
          </group>
        );
      })}
    </>
  );
}

function sampleCorticalField(vertex: THREE.Vector3, electrodes: CorticalElectrode[]) {
  const point = vertex.clone().normalize();
  let weighted = 0;
  let total = 0;

  for (const electrode of electrodes) {
    const distance = point.distanceTo(electrode.position.clone().normalize());
    const weight = 1 / (0.18 + distance * distance * 5.4);
    weighted += electrode.activity * weight;
    total += weight;
  }

  return clamp01(total > 0 ? weighted / total : 0);
}

function projectToCortex(position: [number, number, number], surfaceInset: number) {
  const normal = new THREE.Vector3(position[0], position[1], position[2]).normalize();
  const foldA = Math.sin(normal.y * 18) * 0.06;
  const foldB = Math.cos((normal.x + normal.z) * 14) * 0.045;
  const foldC = Math.sin((normal.x * 9) - (normal.z * 11)) * 0.03;
  const cerebellum = normal.z < -0.45 && normal.y < -0.05 ? 0.12 : 0;
  const scale = 1 + foldA + foldB + foldC - cerebellum * 0.35;

  const surface = new THREE.Vector3(
    normal.x * 1.12 * scale,
    normal.y * 0.92 * (1 + foldB * 0.45),
    normal.z * 1.28 * (1 + foldA * 0.22),
  );

  const inset = surface.clone().add(normal.clone().multiplyScalar(-Math.max(0.03, surfaceInset * 0.22)));

  return {
    position: inset,
    normal,
  };
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

function getGlowHex(activity: number) {
  if (activity < 0.28) return "#4d7bff";
  if (activity < 0.58) return "#45c7ff";
  if (activity < 0.82) return "#ffd84d";
  return "#ff6b4a";
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

function getHeadBlobRadius(
  bandMode: EEGBandMode,
  activity: number,
  spread: number,
) {
  const bandBase = bandMode === "delta" ? 2.2 : bandMode === "gamma" ? -0.8 : 0;
  return (8.5 + bandBase + activity * 10.5) * spread;
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

function cleanLabel(label: string) {
  return label.replace(/-REF|EEG /gi, "").slice(0, 8);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
