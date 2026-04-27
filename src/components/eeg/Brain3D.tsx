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

function ReactiveBrainMesh({
  globalActivity,
  palette,
}: {
  globalActivity: number;
  palette: ReturnType<typeof getBandPalette>;
}) {
  const leftHemisphereRef = useRef<THREE.Mesh>(null);
  const rightHemisphereRef = useRef<THREE.Mesh>(null);
  const cerebellumRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const smoothedActivity = useRef(globalActivity);
  const hemisphereGeometry = useMemo(() => createHemisphereGeometry(), []);
  const cerebellumGeometry = useMemo(() => createCerebellumGeometry(), []);

  useFrame((_state, delta) => {
    smoothedActivity.current = THREE.MathUtils.damp(smoothedActivity.current, globalActivity, 6, delta);
    const activity = smoothedActivity.current;

    if (glowRef.current) {
      glowRef.current.scale.setScalar(1 + activity * 0.18);
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.06 + activity * 0.13;
      material.color.copy(palette.glow);
    }

    [leftHemisphereRef.current, rightHemisphereRef.current].forEach((mesh, index) => {
      if (!mesh) return;
      const material = mesh.material as THREE.MeshPhysicalMaterial;
      mesh.scale.set(
        0.86 + activity * 0.035,
        0.8 + activity * 0.03,
        1 + activity * 0.04,
      );
      material.color.copy(palette.base).lerp(palette.hot, activity * 0.18);
      material.emissive.copy(palette.cool).lerp(palette.glow, activity * 0.5);
      material.emissiveIntensity = 0.12 + activity * (index === 0 ? 1.15 : 1.3);
      material.opacity = 0.32 + activity * 0.1;
    });

    if (cerebellumRef.current) {
      const material = cerebellumRef.current.material as THREE.MeshPhysicalMaterial;
      material.color.copy(new THREE.Color("#5875a3")).lerp(palette.hot, activity * 0.12);
      material.emissive.copy(palette.cool);
      material.emissiveIntensity = 0.05 + activity * 0.6;
      material.opacity = 0.26 + activity * 0.07;
    }
  });

  return (
    <group>
      <mesh ref={glowRef} scale={1.06}>
        <sphereGeometry args={[1.1, 48, 48]} />
        <meshBasicMaterial color={palette.glow} transparent opacity={0.08} depthWrite={false} />
      </mesh>

      <mesh ref={leftHemisphereRef} position={[-0.18, 0, 0]} scale={[0.86, 0.8, 1]}>
        <primitive object={hemisphereGeometry} attach="geometry" />
        <meshPhysicalMaterial
          color={palette.base}
          transparent
          opacity={0.36}
          roughness={0.62}
          transmission={0.06}
          thickness={0.4}
          clearcoat={0.7}
          clearcoatRoughness={0.55}
        />
      </mesh>

      <mesh ref={rightHemisphereRef} position={[0.18, 0, 0]} scale={[0.86, 0.8, 1]}>
        <primitive object={hemisphereGeometry} attach="geometry" />
        <meshPhysicalMaterial
          color={palette.base}
          transparent
          opacity={0.36}
          roughness={0.62}
          transmission={0.06}
          thickness={0.4}
          clearcoat={0.7}
          clearcoatRoughness={0.55}
        />
      </mesh>

      <mesh position={[-0.18, 0, 0]} scale={[0.9, 0.84, 1.02]}>
        <primitive object={hemisphereGeometry} attach="geometry" />
        <meshBasicMaterial color={palette.cool} wireframe transparent opacity={0.08} />
      </mesh>
      <mesh position={[0.18, 0, 0]} scale={[0.9, 0.84, 1.02]}>
        <primitive object={hemisphereGeometry} attach="geometry" />
        <meshBasicMaterial color={palette.cool} wireframe transparent opacity={0.08} />
      </mesh>

      <mesh ref={cerebellumRef} position={[0, -0.55, -0.55]} scale={[0.62, 0.42, 0.42]}>
        <primitive object={cerebellumGeometry} attach="geometry" />
        <meshPhysicalMaterial color="#5875a3" transparent opacity={0.3} roughness={0.76} clearcoat={0.45} />
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
  const haloRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const smoothedAmplitude = useRef(amplitude);

  const normal = useMemo(() => new THREE.Vector3(...position).normalize(), [position]);
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
    const coreScale = 0.62 + glow * 0.8;
    const beamScale = 0.82 + glow * 1.18;
    const hueColor = artifact ? new THREE.Color("#ffb25c") : palette.glow.clone().lerp(palette.hot, glow * 0.45);

    if (coreRef.current) {
      coreRef.current.scale.setScalar(coreScale);
    }
    if (materialRef.current) {
      materialRef.current.color.copy(artifact ? new THREE.Color("#ffe0b2") : palette.cool.clone().lerp(palette.hot, glow * 0.28));
      materialRef.current.emissive.copy(hueColor);
      materialRef.current.emissiveIntensity = 0.35 + glow * 4.2;
      materialRef.current.roughness = 0.16 + (1 - glow) * 0.22;
      materialRef.current.metalness = 0.18 + glow * 0.32;
    }
    if (lightRef.current) {
      lightRef.current.color.copy(hueColor);
      lightRef.current.intensity = 0.28 + glow * 2.7;
      lightRef.current.distance = 0.62 + glow * 0.95 * heatSpread;
    }
    if (haloRef.current) {
      haloRef.current.scale.setScalar(0.85 + glow * 2.6 * heatSpread);
      const haloMaterial = haloRef.current.material as THREE.MeshBasicMaterial;
      haloMaterial.color.copy(hueColor);
      haloMaterial.opacity = 0.04 + glow * 0.17;
    }
    if (beamRef.current) {
      beamRef.current.scale.set(1 + glow * 0.45, beamScale, 1 + glow * 0.45);
      const beamMaterial = beamRef.current.material as THREE.MeshBasicMaterial;
      beamMaterial.color.copy(hueColor);
      beamMaterial.opacity = 0.04 + glow * 0.16;
    }
  });

  return (
    <group position={sunkenPosition}>
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.09, 20, 20]} />
        <meshBasicMaterial color={palette.glow} transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      <mesh ref={beamRef} position={[0, normal.y >= 0 ? 0.12 : -0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.06, 0.22, 24, 1, true]} />
        <meshBasicMaterial color={palette.glow} transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
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

function HeatField({
  electrodes,
  amplitudes,
  palette,
  heatSpread,
}: {
  electrodes: ElectrodeData[];
  amplitudes: number[];
  palette: ReturnType<typeof getBandPalette>;
  heatSpread: number;
}) {
  return (
    <group>
      {electrodes.map((electrode, index) => (
        <HeatBlob
          key={`heat-${electrode.label}-${index}`}
          position={electrode.position}
          activity={amplitudes[index] ?? 0}
          artifact={electrode.artifact}
          palette={palette}
          heatSpread={heatSpread}
        />
      ))}
    </group>
  );
}

function HeatBlob({
  position,
  activity,
  artifact,
  palette,
  heatSpread,
}: {
  position: [number, number, number];
  activity: number;
  artifact: boolean;
  palette: ReturnType<typeof getBandPalette>;
  heatSpread: number;
}) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const smoothedActivity = useRef(activity);

  useFrame((_state, delta) => {
    smoothedActivity.current = THREE.MathUtils.damp(smoothedActivity.current, activity, 8, delta);
    const glow = THREE.MathUtils.smoothstep(smoothedActivity.current, 0.01, 1);
    const radius = (0.22 + glow * 0.46) * heatSpread;
    const color = artifact ? new THREE.Color("#ff9f43") : getHeatColor(glow, palette);

    if (outerRef.current) {
      outerRef.current.scale.setScalar(radius);
      const material = outerRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.03 + glow * 0.2;
      material.color.copy(color);
    }

    if (innerRef.current) {
      innerRef.current.scale.setScalar(radius * 0.48);
      const material = innerRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.02 + glow * 0.18;
      material.color.copy(color.clone().lerp(new THREE.Color("#ffffff"), 0.18));
    }
  });

  return (
    <group position={position}>
      <mesh ref={outerRef}>
        <sphereGeometry args={[1, 18, 18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={innerRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function Scene({
  electrodes,
  amplitudes,
  isPlaying,
  showLabels,
  surfaceInset,
  heatSpread,
  palette,
}: {
  electrodes: ElectrodeData[];
  amplitudes: number[];
  isPlaying: boolean;
  showLabels: boolean;
  surfaceInset: number;
  heatSpread: number;
  palette: ReturnType<typeof getBandPalette>;
}) {
  const globalActivity = amplitudes.length
    ? amplitudes.reduce((sum, value) => sum + value, 0) / amplitudes.length
    : 0;

  return (
    <>
      <fog attach="fog" args={["#040816", 2.8, 6]} />
      <ambientLight intensity={0.3 + globalActivity * 0.24} />
      <pointLight position={[0, 1.4, 1.9]} intensity={0.9 + globalActivity * 1.2} color={palette.glow} />
      <directionalLight position={[2, 3, 2]} intensity={0.78 + globalActivity * 0.55} color="#d8eeff" />
      <directionalLight position={[-2, -1, -1]} intensity={0.2 + globalActivity * 0.28} color={palette.cool} />
      <ReactiveBrainMesh globalActivity={globalActivity} palette={palette} />
      <HeatField electrodes={electrodes} amplitudes={amplitudes} palette={palette} heatSpread={heatSpread} />
      {electrodes.map((electrode, index) => (
        <Electrode
          key={`${electrode.label}-${index}`}
          position={electrode.position}
          label={electrode.label}
          amplitude={amplitudes[index] ?? 0}
          artifact={electrode.artifact}
          showLabel={showLabels || !isPlaying}
          surfaceInset={surfaceInset}
          heatSpread={heatSpread}
          palette={palette}
        />
      ))}
      <OrbitControls enablePan={false} minDistance={2} maxDistance={5} rotateSpeed={0.72} />
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
    return (
      <div className="relative h-full w-full">
        <Canvas camera={{ position: [0, 0.4, 3], fov: 45 }} dpr={[1, 2]}>
          <color attach="background" args={["#040816"]} />
          <Scene
            electrodes={electrodes3D}
            amplitudes={amplitudes}
            isPlaying={isPlaying}
            showLabels={showLabels}
            surfaceInset={surfaceInset}
            heatSpread={heatSpread * spreadMultiplier}
            palette={palette}
          />
        </Canvas>
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

function createHemisphereGeometry() {
  const geometry = new THREE.SphereGeometry(0.85, 72, 72);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const normal = vertex.clone().normalize();
    const foldA = Math.sin(normal.y * 16 + normal.z * 5) * 0.055;
    const foldB = Math.cos(normal.x * 14 - normal.z * 8) * 0.042;
    const foldC = Math.sin((normal.x + normal.y) * 11) * 0.024;
    const posteriorTaper = normal.z < -0.4 ? 1 - Math.abs(normal.z + 0.4) * 0.08 : 1;
    const radialScale = (1 + foldA + foldB + foldC) * posteriorTaper;

    vertex.x *= 1.02 * radialScale;
    vertex.y *= 0.96 * (1 + foldB * 0.2);
    vertex.z *= 1.08 * (1 + foldA * 0.25);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createCerebellumGeometry() {
  const geometry = new THREE.SphereGeometry(0.72, 48, 48);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const normal = vertex.clone().normalize();
    const fold = Math.sin(normal.x * 18) * 0.03 + Math.cos(normal.y * 12) * 0.02;
    vertex.x *= 1.05 * (1 + fold);
    vertex.y *= 0.7 * (1 + fold * 0.4);
    vertex.z *= 0.84 * (1 + fold * 0.3);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
