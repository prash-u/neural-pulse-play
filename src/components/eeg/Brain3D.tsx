import { useId, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Sphere } from "@react-three/drei";
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

interface ElectrodeData {
  label: string;
  position: [number, number, number];
  channelIdx: number;
  artifact: boolean;
}

type CorticalCameraPreset = "top" | "left" | "right" | "anterior" | "posterior";

interface HeadElectrode {
  label: string;
  channelIdx: number;
  x: number;
  y: number;
  activity: number;
  artifact: boolean;
}

const HEAD = { cx: 50, cy: 60, rx: 31.5, ry: 39 };
const VIEWBOX = { width: 100, height: 120 };

function CorticalSurfaceField({
  electrodes,
  amplitudes,
  globalActivity,
  heatSpread,
  palette,
}: {
  electrodes: ElectrodeData[];
  amplitudes: number[];
  globalActivity: number;
  heatSpread: number;
  palette: ReturnType<typeof getBandPalette>;
}) {
  const hemisphereGeometry = useMemo(() => createHemisphereGeometry(), []);
  const cerebellumGeometry = useMemo(() => createCerebellumGeometry(), []);

  return (
    <group>
      <SurfaceFieldMesh
        geometry={hemisphereGeometry}
        offset={[-0.18, 0, 0]}
        scale={[0.92, 0.82, 1.08]}
        electrodes={electrodes}
        amplitudes={amplitudes}
        globalActivity={globalActivity}
        heatSpread={heatSpread}
        palette={palette}
        baseColor="#1c2637"
        tintStrength={0.88}
      />
      <SurfaceFieldMesh
        geometry={hemisphereGeometry}
        offset={[0.18, 0, 0]}
        scale={[0.92, 0.82, 1.08]}
        electrodes={electrodes}
        amplitudes={amplitudes}
        globalActivity={globalActivity}
        heatSpread={heatSpread}
        palette={palette}
        baseColor="#1b2535"
        tintStrength={0.92}
      />
      <SurfaceFieldMesh
        geometry={cerebellumGeometry}
        offset={[0, -0.62, -0.58]}
        scale={[0.66, 0.46, 0.5]}
        electrodes={electrodes}
        amplitudes={amplitudes}
        globalActivity={globalActivity * 0.7}
        heatSpread={heatSpread * 0.82}
        palette={palette}
        baseColor="#182233"
        tintStrength={0.46}
      />

      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.02, 0.003, 8, 48]} />
        <meshBasicMaterial color="#c3edff" transparent opacity={0.14} />
      </mesh>
    </group>
  );
}

function SurfaceFieldMesh({
  geometry,
  offset,
  scale,
  electrodes,
  amplitudes,
  globalActivity,
  heatSpread,
  palette,
  baseColor,
  tintStrength,
}: {
  geometry: THREE.BufferGeometry;
  offset: [number, number, number];
  scale: [number, number, number];
  electrodes: ElectrodeData[];
  amplitudes: number[];
  globalActivity: number;
  heatSpread: number;
  palette: ReturnType<typeof getBandPalette>;
  baseColor: string;
  tintStrength: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const smoothedActivity = useRef(amplitudes.slice());

  const { clonedGeometry, directions } = useMemo(() => {
    const cloned = geometry.clone();
    const positionAttr = cloned.getAttribute("position") as THREE.BufferAttribute;
    const colorAttr = new THREE.BufferAttribute(new Float32Array(positionAttr.count * 3), 3);
    cloned.setAttribute("color", colorAttr);

    const dirs = Array.from({ length: positionAttr.count }, (_, index) => {
      const world = new THREE.Vector3(
        positionAttr.getX(index) * scale[0] + offset[0],
        positionAttr.getY(index) * scale[1] + offset[1],
        positionAttr.getZ(index) * scale[2] + offset[2],
      );
      return world.normalize();
    });

    return { clonedGeometry: cloned, directions: dirs };
  }, [geometry, offset, scale]);

  const electrodeDirections = useMemo(
    () => electrodes.map((electrode) => new THREE.Vector3(...electrode.position).normalize()),
    [electrodes],
  );

  useFrame((_state, delta) => {
    smoothedActivity.current = amplitudes.map((value, index) =>
      THREE.MathUtils.damp(smoothedActivity.current[index] ?? 0, value, 8, delta),
    );

    const colorAttr = clonedGeometry.getAttribute("color") as THREE.BufferAttribute;
    const base = new THREE.Color(baseColor);
    const mixed = new THREE.Color();

    for (let index = 0; index < directions.length; index += 1) {
      const direction = directions[index];
      let field = 0;

      for (let electrodeIndex = 0; electrodeIndex < electrodeDirections.length; electrodeIndex += 1) {
        const dot = THREE.MathUtils.clamp(direction.dot(electrodeDirections[electrodeIndex]), -1, 1);
        const influence = Math.exp((dot - 1) / (0.08 + heatSpread * 0.1));
        field += (smoothedActivity.current[electrodeIndex] ?? 0) * influence;
      }

      const normalizedField = clamp01(field * 1.4);
      const heatColor = getHeatColor(normalizedField, palette);
      mixed.copy(base).lerp(heatColor, normalizedField * tintStrength);
      colorAttr.setXYZ(index, mixed.r, mixed.g, mixed.b);
    }

    colorAttr.needsUpdate = true;

    if (meshRef.current && materialRef.current) {
      meshRef.current.scale.setScalar(1 + globalActivity * 0.012);
      materialRef.current.opacity = 0.88;
      materialRef.current.clearcoat = 0.2 + globalActivity * 0.08;
      materialRef.current.emissive.copy(palette.cool).multiplyScalar(0.045 + globalActivity * 0.05);
      materialRef.current.sheen = 0.14;
      materialRef.current.sheenColor = palette.glow;
    }

    if (wireRef.current) {
      const wireMaterial = wireRef.current.material as THREE.MeshBasicMaterial;
      wireMaterial.opacity = 0.045 + globalActivity * 0.02;
      wireMaterial.color.copy(palette.cool);
    }
  });

  return (
    <group position={offset} scale={scale}>
      <mesh ref={meshRef} geometry={clonedGeometry}>
        <meshPhysicalMaterial
          ref={materialRef}
          vertexColors
          transparent
          opacity={0.88}
          roughness={0.68}
          metalness={0.05}
          reflectivity={0.18}
          clearcoat={0.22}
          clearcoatRoughness={0.78}
        />
      </mesh>
      <mesh ref={wireRef} geometry={clonedGeometry} scale={[1.005, 1.005, 1.005]}>
        <meshBasicMaterial transparent opacity={0.06} wireframe depthWrite={false} />
      </mesh>
    </group>
  );
}

function Electrode({
  position,
  label,
  amplitude,
  artifact,
  showLabel,
  surfaceInset,
  heatSpread,
  palette,
}: {
  position: [number, number, number];
  label: string;
  amplitude: number;
  artifact: boolean;
  showLabel: boolean;
  surfaceInset: number;
  heatSpread: number;
  palette: ReturnType<typeof getBandPalette>;
}) {
  const coreRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const smoothedAmplitude = useRef(amplitude);

  const normal = useMemo(() => new THREE.Vector3(...position).normalize(), [position]);
  const ringQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    [normal],
  );
  const sunkenPosition = useMemo<[number, number, number]>(() => {
    const inset = Math.max(0.02, surfaceInset * 0.22);
    return [
      position[0] - normal.x * inset,
      position[1] - normal.y * inset,
      position[2] - normal.z * inset,
    ];
  }, [normal, position, surfaceInset]);

  useFrame((_state, delta) => {
    smoothedAmplitude.current = THREE.MathUtils.damp(smoothedAmplitude.current, amplitude, 10, delta);
    const activity = THREE.MathUtils.smoothstep(smoothedAmplitude.current, 0.02, 1);
    const glow = activity;
    const coreScale = 0.72 + glow * 0.42;
    const hueColor = artifact ? new THREE.Color("#ffb25c") : palette.glow.clone().lerp(palette.hot, glow * 0.45);

    if (coreRef.current) {
      coreRef.current.scale.setScalar(coreScale);
    }
    if (materialRef.current) {
      materialRef.current.color.copy(artifact ? new THREE.Color("#ffe0b2") : palette.cool.clone().lerp(palette.hot, glow * 0.28));
      materialRef.current.emissive.copy(hueColor);
      materialRef.current.emissiveIntensity = 0.16 + glow * 1.25;
      materialRef.current.roughness = 0.16 + (1 - glow) * 0.22;
      materialRef.current.metalness = 0.18 + glow * 0.32;
    }
    if (lightRef.current) {
      lightRef.current.color.copy(hueColor);
      lightRef.current.intensity = 0.02 + glow * 0.18;
      lightRef.current.distance = 0.18 + glow * 0.14 * heatSpread;
    }
  });

  return (
    <group position={sunkenPosition}>
      <mesh quaternion={ringQuaternion} position={[normal.x * 0.01, normal.y * 0.01, normal.z * 0.01]}>
        <ringGeometry args={[0.036, 0.055, 32]} />
        <meshBasicMaterial
          color={artifact ? "#ffb25c" : palette.cool}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>

      <Sphere ref={coreRef} args={[0.046, 24, 24]}>
        <meshStandardMaterial ref={materialRef} color={palette.cool} emissive={palette.glow} emissiveIntensity={1} />
      </Sphere>

      <pointLight ref={lightRef} color={palette.glow} distance={1} intensity={0.8} />

      {showLabel && (
        <Html
          center
          distanceFactor={7}
          style={{
            pointerEvents: "none",
            fontSize: "10px",
            fontWeight: 700,
            color: "hsl(213, 45%, 97%)",
            textShadow: "0 0 6px hsl(220 60% 5%)",
            whiteSpace: "nowrap",
            transform: "translateY(-16px)",
          }}
        >
          {cleanLabel(label)}
        </Html>
      )}
    </group>
  );
}

function Scene({
  electrodes,
  amplitudes,
  showLabels,
  surfaceInset,
  heatSpread,
  palette,
  cameraPreset,
}: {
  electrodes: ElectrodeData[];
  amplitudes: number[];
  showLabels: boolean;
  surfaceInset: number;
  heatSpread: number;
  palette: ReturnType<typeof getBandPalette>;
  cameraPreset: CorticalCameraPreset;
}) {
  const globalActivity = amplitudes.length
    ? amplitudes.reduce((sum, value) => sum + value, 0) / amplitudes.length
    : 0;

  return (
    <>
      <fog attach="fog" args={["#040816", 2.8, 6]} />
      <ambientLight intensity={0.24 + globalActivity * 0.07} />
      <hemisphereLight groundColor="#030711" color="#cfe7ff" intensity={0.26} />
      <pointLight position={[0, 1.9, 1.2]} intensity={0.12 + globalActivity * 0.08} color={palette.glow} />
      <directionalLight position={[2, 3, 2]} intensity={0.5 + globalActivity * 0.08} color="#d8eeff" />
      <directionalLight position={[-2.4, 0.6, -1.6]} intensity={0.16 + globalActivity * 0.06} color="#8fb8ff" />
      <CorticalSurfaceField
        electrodes={electrodes}
        amplitudes={amplitudes}
        globalActivity={globalActivity}
        heatSpread={heatSpread}
        palette={palette}
      />
      {electrodes.map((electrode, index) => (
        <Electrode
          key={`${electrode.label}-${index}`}
          position={electrode.position}
          label={electrode.label}
          amplitude={amplitudes[index] ?? 0}
          artifact={electrode.artifact}
          showLabel={showLabels}
          surfaceInset={surfaceInset}
          heatSpread={heatSpread}
          palette={palette}
        />
      ))}
      <CameraPresetController preset={cameraPreset} />
      <OrbitControls enablePan={false} minDistance={2} maxDistance={5} rotateSpeed={0.7} />
    </>
  );
}

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
  const [cameraPreset, setCameraPreset] = useState<CorticalCameraPreset>("top");

  const qualityByLabel = useMemo(() => new Map(quality.map((channel) => [channel.label, channel])), [quality]);

  const electrodes3D = useMemo<ElectrodeData[]>(() => {
    const output: ElectrodeData[] = [];
    recording.channels.forEach((channel, index) => {
      const position = resolveElectrodePosition(channel.label);
      if (position) {
        output.push({
          label: channel.label,
          position,
          channelIdx: index,
          artifact: qualityByLabel.get(channel.label)?.artifact ?? false,
        });
      }
    });
    return output;
  }, [qualityByLabel, recording]);

  const headElectrodes = useMemo<HeadElectrode[]>(() => {
    const output: HeadElectrode[] = [];
    recording.channels.forEach((channel, index) => {
      const position = resolveElectrodePosition(channel.label);
      if (!position) return;
      output.push({
        label: channel.label,
        channelIdx: index,
        x: 50 + position[0] * 31.5,
        y: 60 - position[2] * 37 - position[1] * 4.5,
        activity: 0,
        artifact: qualityByLabel.get(channel.label)?.artifact ?? false,
      });
    });
    return output;
  }, [qualityByLabel, recording]);

  const amplitudes = useMemo(() => {
    const byChannel = computeChannelActivities(recording, currentTime);
    return electrodes3D.map((electrode) => clamp01((byChannel[electrode.channelIdx]?.activity ?? 0) * signalGain));
  }, [currentTime, electrodes3D, recording, signalGain]);

  const headActivities = useMemo(() => {
    const byChannel = computeChannelActivities(recording, currentTime);
    return headElectrodes.map((electrode) => ({
      ...electrode,
      activity: clamp01((byChannel[electrode.channelIdx]?.activity ?? 0) * signalGain),
    }));
  }, [currentTime, headElectrodes, recording, signalGain]);

  const palette = getBandPalette(bandMode);
  const spreadMultiplier = getBandSpreadMultiplier(bandMode);

  if (mode === "cortical") {
    const averageActivity = amplitudes.length ? amplitudes.reduce((sum, value) => sum + value, 0) / amplitudes.length : 0;
    const hotChannels = electrodes3D
      .map((electrode, index) => ({ label: cleanLabel(electrode.label), activity: amplitudes[index] ?? 0 }))
      .sort((a, b) => b.activity - a.activity)
      .slice(0, 3);

    return (
      <div className="relative h-full w-full">
        <Canvas camera={{ position: [0, 0.4, 3], fov: 45 }} dpr={[1, 2]}>
          <color attach="background" args={["#040816"]} />
          <Scene
            electrodes={electrodes3D}
            amplitudes={amplitudes}
            showLabels={showLabels}
            surfaceInset={surfaceInset}
            heatSpread={heatSpread * spreadMultiplier}
            palette={palette}
            cameraPreset={cameraPreset}
          />
        </Canvas>

        <div className="pointer-events-none absolute left-4 top-4 rounded-[1.2rem] border border-white/10 bg-[rgba(4,8,22,0.78)] px-4 py-3 backdrop-blur-xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Cortical inspection</div>
          <div className="mt-2 grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Band</div>
              <div className="mt-1 font-semibold text-foreground">{bandMode.toUpperCase()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Mean field</div>
              <div className="mt-1 font-semibold text-foreground">{Math.round(averageActivity * 100)}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">State</div>
              <div className="mt-1 font-semibold text-foreground">{isPlaying ? "Live" : "Paused"}</div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
          {([
            ["top", "Top"],
            ["anterior", "Front"],
            ["left", "Left"],
            ["right", "Right"],
            ["posterior", "Posterior"],
          ] as const).map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              onClick={() => setCameraPreset(preset)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                cameraPreset === preset ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 bg-[rgba(4,8,22,0.72)] text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pointer-events-none absolute right-4 top-4 w-[10.5rem] rounded-[1.15rem] border border-white/10 bg-[rgba(4,8,22,0.74)] p-3 backdrop-blur-xl">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Peak contacts</div>
          <div className="mt-3 grid gap-2">
            {hotChannels.map((channel) => (
              <div key={channel.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-foreground">{channel.label}</span>
                <span className="font-mono text-muted-foreground">{Math.round(channel.activity * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#040816]">
      <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="h-full w-full" role="img" aria-label="EEG head map">
        <defs>
          <clipPath id={`${gradientNamespace}-head-clip`}>
            <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
          </clipPath>
          {headActivities.map((electrode) => {
            const heat = getContinuousHeatColor(electrode.activity, palette);
            const hotColor = electrode.artifact ? "#ff9f43" : heat.core.getStyle();
            const glowColor = electrode.artifact ? "#ff8f5b" : heat.glow.getStyle();
            return (
              <radialGradient key={`${gradientNamespace}-${electrode.label}`} id={`${gradientNamespace}-${electrode.label}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={hotColor} stopOpacity={Math.min(0.98, 0.34 + electrode.activity * 0.66)} />
                <stop offset="32%" stopColor={hotColor} stopOpacity={Math.min(0.82, 0.18 + electrode.activity * 0.54)} />
                <stop offset="68%" stopColor={glowColor} stopOpacity={Math.min(0.42, 0.08 + electrode.activity * 0.28)} />
                <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
              </radialGradient>
            );
          })}
          {headActivities.map((electrode) => (
            <filter key={`${gradientNamespace}-${electrode.label}-blur`} id={`${gradientNamespace}-${electrode.label}-blur`}>
              <feGaussianBlur stdDeviation={getHeadBlobRadius(bandMode, electrode.activity, heatSpread * spreadMultiplier) * 0.16} />
            </filter>
          ))}
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
          {headActivities.map((electrode) => (
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

        {headActivities.map((electrode) => {
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
                fill={electrode.artifact ? "hsl(32 95% 60%)" : "rgba(236,244,255,0.96)"}
                stroke={electrode.artifact ? "rgba(255,140,64,0.92)" : "rgba(7,14,25,0.92)"}
                strokeWidth={electrode.artifact ? 0.8 : 0.55}
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

function getBandPalette(bandMode: EEGBandMode) {
  switch (bandMode) {
    case "delta":
      return {
        base: new THREE.Color("#4c6792"),
        cool: new THREE.Color("#3978ff"),
        glow: new THREE.Color("#49d3ff"),
        hot: new THREE.Color("#7ce8ff"),
      };
    case "theta":
      return {
        base: new THREE.Color("#575d9e"),
        cool: new THREE.Color("#7a5cff"),
        glow: new THREE.Color("#57c8ff"),
        hot: new THREE.Color("#9ad7ff"),
      };
    case "alpha":
      return {
        base: new THREE.Color("#6075a0"),
        cool: new THREE.Color("#2ecbff"),
        glow: new THREE.Color("#ffd84d"),
        hot: new THREE.Color("#ff7f50"),
      };
    case "beta":
      return {
        base: new THREE.Color("#5c7096"),
        cool: new THREE.Color("#34e0a1"),
        glow: new THREE.Color("#ffd84d"),
        hot: new THREE.Color("#ff9c44"),
      };
    case "gamma":
      return {
        base: new THREE.Color("#665d8d"),
        cool: new THREE.Color("#ff5ea9"),
        glow: new THREE.Color("#ff9b4d"),
        hot: new THREE.Color("#ff5d47"),
      };
    default:
      return {
        base: new THREE.Color("#6075a0"),
        cool: new THREE.Color("#55a2ff"),
        glow: new THREE.Color("#49d3ff"),
        hot: new THREE.Color("#ff7f50"),
      };
  }
}

function getHeatColor(activity: number, palette: ReturnType<typeof getBandPalette>) {
  if (activity < 0.33) return palette.cool.clone().lerp(palette.glow, activity * 1.4);
  if (activity < 0.66) return palette.glow.clone().lerp(new THREE.Color("#ffd84d"), (activity - 0.33) / 0.33);
  return new THREE.Color("#ffd84d").lerp(palette.hot, (activity - 0.66) / 0.34);
}

function getContinuousHeatColor(activity: number, palette: ReturnType<typeof getBandPalette>) {
  return {
    glow: getHeatColor(Math.max(0, activity * 0.82), palette),
    core: getHeatColor(Math.min(1, activity + 0.2), palette),
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

function getHeadBlobRadius(bandMode: EEGBandMode, activity: number, spread: number) {
  const bandBase = bandMode === "delta" ? 2.2 : bandMode === "gamma" ? -0.8 : 0;
  return (8.5 + bandBase + activity * 10.5) * spread;
}

function cleanLabel(label: string) {
  return label.replace(/-REF|EEG /gi, "").slice(0, 8);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function CameraPresetController({
  preset,
}: {
  preset: CorticalCameraPreset;
}) {
  useFrame((state, delta) => {
    const targets: Record<CorticalCameraPreset, THREE.Vector3> = {
      top: new THREE.Vector3(0, 3.45, 0.01),
      anterior: new THREE.Vector3(0, 0.25, 3.2),
      left: new THREE.Vector3(-2.85, 0.28, 1.55),
      right: new THREE.Vector3(2.85, 0.28, 1.55),
      posterior: new THREE.Vector3(0, 0.18, -3.2),
    };
    state.camera.position.lerp(targets[preset], 1 - Math.exp(-delta * 3.6));
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

function createHemisphereGeometry() {
  const geometry = new THREE.SphereGeometry(0.82, 80, 80);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const normal = vertex.clone().normalize();
    const frontalBulge = normal.z > 0 ? 1 + normal.z * 0.18 : 1 + normal.z * 0.04;
    const occipitalShelf = normal.z < -0.2 ? 1 + Math.abs(normal.z + 0.2) * 0.1 : 1;
    const temporalDrop = normal.y < -0.15 ? 1 - Math.abs(normal.y + 0.15) * 0.18 : 1;
    const superiorCurve = normal.y > 0.2 ? 1 + normal.y * 0.08 : 1;
    const foldA = Math.sin(normal.y * 18 + normal.z * 7) * 0.038;
    const foldB = Math.cos(normal.x * 16 - normal.z * 10) * 0.03;
    const foldC = Math.sin((normal.x - normal.y) * 12) * 0.018;
    const medialFlatten = 1 - Math.max(0, 0.32 - Math.abs(normal.x)) * 0.22;
    const radialScale = (1 + foldA + foldB + foldC) * frontalBulge * occipitalShelf * temporalDrop * superiorCurve;

    vertex.x *= 0.96 * medialFlatten * radialScale;
    vertex.y *= 0.84 * radialScale;
    vertex.z *= 1.22 * radialScale;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createCerebellumGeometry() {
  const geometry = new THREE.SphereGeometry(0.64, 56, 56);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const normal = vertex.clone().normalize();
    const fold = Math.sin(normal.x * 18) * 0.024 + Math.cos(normal.y * 12) * 0.018;
    vertex.x *= 1.12 * (1 + fold);
    vertex.y *= 0.58 * (1 + fold * 0.35);
    vertex.z *= 0.76 * (1 + fold * 0.28);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
