import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { computeChannelActivities } from "@/lib/eeg/activity";
import type { EEGRecording } from "@/lib/eeg/types";
import { resolveElectrodePosition } from "@/lib/eeg/montage";

interface Props {
  recording: EEGRecording;
  currentTime: number;
  isPlaying: boolean;
  mode: "headset" | "brain";
  signalGain?: number;
  heatSpread?: number;
  surfaceInset?: number;
}

interface ElectrodeData {
  label: string;
  position: [number, number, number];
  channelIdx: number;
}

const ACTIVITY_COLOR = new THREE.Color("hsl(188, 100%, 70%)");
const SECONDARY_ACTIVITY_COLOR = new THREE.Color("hsl(330, 88%, 72%)");
const BASE_HEAD_COLOR = new THREE.Color("hsl(210, 70%, 35%)");
const BASE_BRAIN_COLOR = new THREE.Color("hsl(340, 40%, 68%)");
const BASE_CEREBELLUM_COLOR = new THREE.Color("hsl(340, 35%, 58%)");

function ReactiveHeadMesh({
  mode,
  globalActivity,
  heatSpread,
  electrodes,
  amplitudes,
}: {
  mode: "headset" | "brain";
  globalActivity: number;
  heatSpread: number;
  electrodes: ElectrodeData[];
  amplitudes: number[];
}) {
  const shellRef = useRef<THREE.Mesh>(null);
  const shellMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const shellWireRef = useRef<THREE.MeshBasicMaterial>(null);
  const leftHemisphereRef = useRef<THREE.Mesh>(null);
  const rightHemisphereRef = useRef<THREE.Mesh>(null);
  const cerebellumRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const smoothedActivity = useRef(globalActivity);
  const leftGeometry = useMemo(() => createCortexGeometry("left"), []);
  const rightGeometry = useMemo(() => createCortexGeometry("right"), []);
  const cerebellumGeometry = useMemo(() => createCerebellumGeometry(), []);
  const leftPositions = useMemo(() => extractVertexPositions(leftGeometry), [leftGeometry]);
  const rightPositions = useMemo(() => extractVertexPositions(rightGeometry), [rightGeometry]);
  const cerebellumPositions = useMemo(() => extractVertexPositions(cerebellumGeometry), [cerebellumGeometry]);

  useFrame((_state, delta) => {
    smoothedActivity.current = THREE.MathUtils.damp(smoothedActivity.current, globalActivity, 7, delta);
    const activity = smoothedActivity.current;

    if (shellRef.current) {
      shellRef.current.scale.setScalar(1 + activity * 0.045);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1 + activity * 0.12);
    }
    if (shellMaterialRef.current) {
      shellMaterialRef.current.opacity = 0.22 + activity * 0.16;
      shellMaterialRef.current.color.copy(BASE_HEAD_COLOR).lerp(ACTIVITY_COLOR, activity * 0.3);
      shellMaterialRef.current.emissive.copy(ACTIVITY_COLOR);
      shellMaterialRef.current.emissiveIntensity = 0.15 + activity * 1.4;
    }
    if (shellWireRef.current) {
      shellWireRef.current.color.copy(ACTIVITY_COLOR);
      shellWireRef.current.opacity = 0.16 + activity * 0.18;
    }

    [leftHemisphereRef.current, rightHemisphereRef.current].forEach((mesh) => {
      if (!mesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(BASE_BRAIN_COLOR).lerp(SECONDARY_ACTIVITY_COLOR, activity * 0.28);
      material.emissive.copy(ACTIVITY_COLOR);
      material.emissiveIntensity = 0.18 + activity * 1.8;
    });

    if (cerebellumRef.current) {
      const material = cerebellumRef.current.material as THREE.MeshStandardMaterial;
      material.color.copy(BASE_CEREBELLUM_COLOR).lerp(SECONDARY_ACTIVITY_COLOR, activity * 0.2);
      material.emissive.copy(ACTIVITY_COLOR);
      material.emissiveIntensity = 0.08 + activity * 1.1;
    }

    if (mode === "brain") {
      applySurfaceHeat(
        leftGeometry,
        leftPositions,
        [-0.11, 0, 0],
        [0.86, 0.83, 1.02],
        BASE_BRAIN_COLOR,
        electrodes,
        amplitudes,
        heatSpread,
      );
      applySurfaceHeat(
        rightGeometry,
        rightPositions,
        [0.11, 0, 0],
        [0.86, 0.83, 1.02],
        BASE_BRAIN_COLOR,
        electrodes,
        amplitudes,
        heatSpread,
      );
      applySurfaceHeat(
        cerebellumGeometry,
        cerebellumPositions,
        [0, -0.52, -0.56],
        [0.6, 0.4, 0.44],
        BASE_CEREBELLUM_COLOR,
        electrodes,
        amplitudes,
        heatSpread * 0.8,
      );
    }
  });

  if (mode === "brain") {
    return (
      <group>
        <mesh ref={glowRef} scale={1.02}>
          <sphereGeometry args={[1.06, 48, 48]} />
          <meshBasicMaterial color={ACTIVITY_COLOR} transparent opacity={0.08} depthWrite={false} />
        </mesh>
        <mesh ref={leftHemisphereRef} geometry={leftGeometry} position={[-0.11, 0, 0]} scale={[0.86, 0.83, 1.02]}>
          <meshPhysicalMaterial color={BASE_BRAIN_COLOR} roughness={0.78} metalness={0.05} clearcoat={0.18} clearcoatRoughness={0.72} vertexColors />
        </mesh>
        <mesh ref={rightHemisphereRef} geometry={rightGeometry} position={[0.11, 0, 0]} scale={[0.86, 0.83, 1.02]}>
          <meshPhysicalMaterial color={BASE_BRAIN_COLOR} roughness={0.78} metalness={0.05} clearcoat={0.18} clearcoatRoughness={0.72} vertexColors />
        </mesh>
        <mesh ref={cerebellumRef} geometry={cerebellumGeometry} position={[0, -0.52, -0.56]} scale={[0.6, 0.4, 0.44]}>
          <meshPhysicalMaterial color={BASE_CEREBELLUM_COLOR} roughness={0.84} metalness={0.03} clearcoat={0.1} clearcoatRoughness={0.8} vertexColors />
        </mesh>
        <mesh position={[0, 0.02, 0]} scale={[0.98 + heatSpread * 0.03, 0.94 + heatSpread * 0.02, 1.02]}>
          <sphereGeometry args={[0.96, 42, 42]} />
          <meshBasicMaterial color={ACTIVITY_COLOR} transparent opacity={0.035 + globalActivity * 0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh ref={glowRef} scale={1.03}>
        <sphereGeometry args={[1.02, 40, 40]} />
        <meshBasicMaterial color={ACTIVITY_COLOR} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh ref={shellRef}>
        <sphereGeometry args={[0.96, 48, 48]} />
        <meshStandardMaterial
          ref={shellMaterialRef}
          color={BASE_HEAD_COLOR}
          transparent
          opacity={0.25}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.965, 24, 24]} />
        <meshBasicMaterial ref={shellWireRef} color={ACTIVITY_COLOR} wireframe transparent opacity={0.18} />
      </mesh>
      <mesh position={[0, 0.25, 0.95]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.05, 0.15, 16]} />
        <meshStandardMaterial color={ACTIVITY_COLOR} emissive={ACTIVITY_COLOR} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function Electrode({
  position,
  label,
  amplitude,
  animate,
  showLabel,
  mode,
  surfaceInset,
}: {
  position: [number, number, number];
  label: string;
  amplitude: number;
  animate: boolean;
  showLabel: boolean;
  mode: "headset" | "brain";
  surfaceInset: number;
}) {
  const coreRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const smoothedAmplitude = useRef(amplitude);

  useFrame((_state, delta) => {
    smoothedAmplitude.current = THREE.MathUtils.damp(smoothedAmplitude.current, amplitude, 10, delta);
    const activity = THREE.MathUtils.smoothstep(smoothedAmplitude.current, 0.02, 1);
    const glow = animate ? activity : smoothedAmplitude.current;
    const baseRadius = mode === "brain" ? 0.018 : 0.04;
    const scale = baseRadius + glow * (mode === "brain" ? 0.022 : 0.08);

    if (coreRef.current) {
      coreRef.current.scale.setScalar(scale / 0.05);
    }
    if (materialRef.current) {
      materialRef.current.color.copy(ACTIVITY_COLOR).lerp(SECONDARY_ACTIVITY_COLOR, glow * 0.45);
      materialRef.current.emissive.copy(ACTIVITY_COLOR);
      materialRef.current.emissiveIntensity = mode === "brain" ? 0.12 + glow * 0.75 : 0.45 + glow * 4.8;
      materialRef.current.roughness = mode === "brain" ? 0.42 : 0.18 + (1 - glow) * 0.25;
      materialRef.current.metalness = mode === "brain" ? 0.08 : 0.25 + glow * 0.35;
      materialRef.current.opacity = mode === "brain" ? 0.72 : 1;
      materialRef.current.transparent = mode === "brain";
    }
    if (lightRef.current) {
      lightRef.current.intensity = mode === "brain" ? 0.02 + glow * 0.2 : 0.5 + glow * 3.4;
      lightRef.current.distance = mode === "brain" ? 0.18 + glow * 0.18 : 0.7 + glow * 1.1;
    }
    if (haloRef.current) {
      haloRef.current.scale.setScalar(1 + glow * 2.6);
      const haloMaterial = haloRef.current.material as THREE.MeshBasicMaterial;
      haloMaterial.opacity = 0.08 + glow * 0.2;
    }
    if (beamRef.current) {
      beamRef.current.scale.set(1 + glow * 0.55, 0.75 + glow * 1.2, 1 + glow * 0.55);
      const beamMaterial = beamRef.current.material as THREE.MeshBasicMaterial;
      beamMaterial.opacity = 0.06 + glow * 0.18;
    }
  });

  const anchoredPosition = mode === "brain"
    ? sinkPosition(position, surfaceInset)
    : position;

  return (
    <group position={anchoredPosition}>
      {mode === "headset" && (
        <>
          <mesh ref={haloRef}>
            <sphereGeometry args={[0.08, 18, 18]} />
            <meshBasicMaterial color={ACTIVITY_COLOR} transparent opacity={0.12} depthWrite={false} />
          </mesh>
          <mesh ref={beamRef} position={[0, position[1] >= 0 ? 0.18 : -0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.08, 0.32, 24, 1, true]} />
            <meshBasicMaterial color={ACTIVITY_COLOR} transparent opacity={0.1} depthWrite={false} />
          </mesh>
        </>
      )}
      <Sphere ref={coreRef} args={[0.05, 24, 24]}>
        <meshStandardMaterial ref={materialRef} color={ACTIVITY_COLOR} emissive={ACTIVITY_COLOR} emissiveIntensity={1} />
      </Sphere>
      <pointLight ref={lightRef} color={ACTIVITY_COLOR} distance={mode === "brain" ? 0.42 : 1} intensity={mode === "brain" ? 0.35 : 0.8} />
      {showLabel && (
        <Html
          center
          distanceFactor={6}
          style={{
            pointerEvents: "none",
            fontSize: "10px",
            fontWeight: 700,
            color: "hsl(213, 45%, 97%)",
            textShadow: "0 0 6px hsl(220 60% 5%)",
            whiteSpace: "nowrap",
            transform: "translateY(-18px)",
          }}
        >
          {label}
        </Html>
      )}
    </group>
  );
}

function HeatField({
  electrodes,
  amplitudes,
  mode,
  heatSpread,
  surfaceInset,
}: {
  electrodes: ElectrodeData[];
  amplitudes: number[];
  mode: "headset" | "brain";
  heatSpread: number;
  surfaceInset: number;
}) {
  if (mode === "brain") return null;
  return (
    <group>
      {electrodes.map((electrode, index) => {
        const activity = amplitudes[index] ?? 0;
        return (
          <HeatBlob
            key={`heat-${electrode.label}-${index}`}
            position={mode === "brain" ? sinkPosition(electrode.position, surfaceInset * 0.72) : electrode.position}
            activity={activity}
            mode={mode}
            heatSpread={heatSpread}
          />
        );
      })}
    </group>
  );
}

function HeatBlob({
  position,
  activity,
  mode,
  heatSpread,
}: {
  position: [number, number, number];
  activity: number;
  mode: "headset" | "brain";
  heatSpread: number;
}) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const smoothedActivity = useRef(activity);

  useFrame((_state, delta) => {
    smoothedActivity.current = THREE.MathUtils.damp(smoothedActivity.current, activity, 8, delta);
    const glow = THREE.MathUtils.smoothstep(smoothedActivity.current, 0.01, 1);
    const radius = mode === "brain"
      ? (0.075 + glow * 0.125) * heatSpread
      : 0.13 + glow * 0.16;

    if (outerRef.current) {
      outerRef.current.scale.setScalar(radius);
      const material = outerRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (mode === "brain" ? 0.02 : 0.045) + glow * (mode === "brain" ? 0.14 : 0.16);
      material.color.copy(getHeatColor(glow));
    }

    if (innerRef.current) {
      innerRef.current.scale.setScalar(radius * (mode === "brain" ? 0.5 : 0.42));
      const material = innerRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (mode === "brain" ? 0.015 : 0.02) + glow * (mode === "brain" ? 0.11 : 0.18);
      material.color.copy(getHeatColor(Math.min(1, glow + 0.18)));
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
  mode,
  isPlaying,
  heatSpread,
  surfaceInset,
}: {
  electrodes: ElectrodeData[];
  amplitudes: number[];
  mode: "headset" | "brain";
  isPlaying: boolean;
  heatSpread: number;
  surfaceInset: number;
}) {
  const globalActivity = amplitudes.length
    ? amplitudes.reduce((sum, value) => sum + value, 0) / amplitudes.length
    : 0;

  return (
    <>
      <fog attach="fog" args={["#040816", 2.8, 6]} />
      <ambientLight intensity={0.35 + globalActivity * 0.25} />
      <pointLight position={[0, 1.4, 1.9]} intensity={1 + globalActivity * 1.6} color={ACTIVITY_COLOR} />
      <directionalLight position={[2, 3, 2]} intensity={0.8 + globalActivity * 0.7} />
      <directionalLight position={[-2, -1, -1]} intensity={0.25 + globalActivity * 0.35} color="hsl(220, 100%, 78%)" />
      <ReactiveHeadMesh
        mode={mode}
        globalActivity={globalActivity}
        heatSpread={heatSpread}
        electrodes={electrodes}
        amplitudes={amplitudes}
      />
      {mode === "headset" && (
        <HeatField electrodes={electrodes} amplitudes={amplitudes} mode={mode} heatSpread={heatSpread} surfaceInset={surfaceInset} />
      )}
      {electrodes.map((electrode, index) => (
        <Electrode
          key={`${electrode.label}-${index}`}
          position={electrode.position}
          label={electrode.label}
          amplitude={amplitudes[index] ?? 0}
          animate={isPlaying}
          showLabel={mode === "headset"}
          mode={mode}
          surfaceInset={surfaceInset}
        />
      ))}
      <OrbitControls enablePan={false} minDistance={2} maxDistance={5} />
    </>
  );
}

export function Brain3D({
  recording,
  currentTime,
  isPlaying,
  mode,
  signalGain = 1.15,
  heatSpread = 1,
  surfaceInset = 0.14,
}: Props) {
  const electrodes = useMemo<ElectrodeData[]>(() => {
    const output: ElectrodeData[] = [];
    recording.channels.forEach((channel, index) => {
      const position = resolveElectrodePosition(channel.label);
      if (position) output.push({ label: channel.label, position, channelIdx: index });
    });
    return output;
  }, [recording]);

  const amplitudes = useMemo(() => {
    const byChannel = computeChannelActivities(recording, currentTime);
    return electrodes.map((electrode) => {
      const base = byChannel[electrode.channelIdx]?.activity ?? 0;
      return THREE.MathUtils.clamp(base * signalGain, 0, 1);
    });
  }, [currentTime, electrodes, recording, signalGain]);

  return (
    <Canvas camera={{ position: [0, 0.4, 3], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={["#040816"]} />
      <Scene
        electrodes={electrodes}
        amplitudes={amplitudes}
        mode={mode}
        isPlaying={isPlaying}
        heatSpread={heatSpread}
        surfaceInset={surfaceInset}
      />
    </Canvas>
  );
}

function createCortexGeometry(side: "left" | "right") {
  const geometry = new THREE.IcosahedronGeometry(0.94, 6);
  const position = geometry.attributes.position;
  const vector = new THREE.Vector3();
  const direction = side === "left" ? -1 : 1;

  for (let i = 0; i < position.count; i++) {
    vector.fromBufferAttribute(position, i);
    vector.x = Math.abs(vector.x) * direction;

    const yBias = 1 - Math.abs(vector.y) * 0.18;
    const zStretch = 1 + Math.max(0, -vector.z) * 0.1;
    vector.y *= 0.92 * yBias;
    vector.z *= 1.08 * zStretch;
    vector.x *= 0.78;

    const ridge =
      Math.sin(vector.y * 15 + vector.z * 6) * 0.045 +
      Math.cos(vector.z * 17 - vector.y * 4) * 0.032 +
      Math.sin((vector.y + vector.x * 0.8) * 24) * 0.018;
    const cleftFalloff = THREE.MathUtils.smoothstep(Math.abs(vector.x), 0.02, 0.32);
    const radius = 1 + ridge * cleftFalloff;

    vector.multiplyScalar(radius);
    vector.x += direction * 0.02;
    position.setXYZ(i, vector.x, vector.y, vector.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createCerebellumGeometry() {
  const geometry = new THREE.IcosahedronGeometry(0.68, 4);
  const position = geometry.attributes.position;
  const vector = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vector.fromBufferAttribute(position, i);
    vector.y *= 0.74;
    vector.z *= 0.92;
    const ridge = Math.sin(vector.x * 18) * 0.03 + Math.cos(vector.y * 24 + vector.z * 8) * 0.018;
    vector.multiplyScalar(1 + ridge);
    position.setXYZ(i, vector.x, vector.y, vector.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function sinkPosition(position: [number, number, number], inset: number): [number, number, number] {
  const factor = 1 - inset;
  return [position[0] * factor, position[1] * factor, position[2] * factor];
}

function extractVertexPositions(geometry: THREE.BufferGeometry) {
  const attribute = geometry.attributes.position;
  const points: [number, number, number][] = [];
  for (let i = 0; i < attribute.count; i++) {
    points.push([attribute.getX(i), attribute.getY(i), attribute.getZ(i)]);
  }
  ensureColorAttribute(geometry, attribute.count);
  return points;
}

function ensureColorAttribute(geometry: THREE.BufferGeometry, count: number) {
  if (!geometry.getAttribute("color")) {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(count * 3, 3));
  }
}

function applySurfaceHeat(
  geometry: THREE.BufferGeometry,
  vertices: [number, number, number][],
  offset: [number, number, number],
  scale: [number, number, number],
  baseColor: THREE.Color,
  electrodes: ElectrodeData[],
  amplitudes: number[],
  heatSpread: number,
) {
  const colorAttribute = geometry.getAttribute("color") as THREE.BufferAttribute;
  const world = new THREE.Vector3();
  const mixedColor = new THREE.Color();
  const electrodePosition = new THREE.Vector3();

  for (let i = 0; i < vertices.length; i++) {
    const [x, y, z] = vertices[i];
    world.set(x * scale[0] + offset[0], y * scale[1] + offset[1], z * scale[2] + offset[2]);

    let heat = 0;
    let totalWeight = 0;
    for (let j = 0; j < electrodes.length; j++) {
      const electrode = electrodes[j];
      const amplitude = amplitudes[j] ?? 0;
      if (amplitude <= 0) continue;
      electrodePosition.set(...electrode.position);
      const distance = world.distanceTo(electrodePosition);
      const influence = Math.exp(-(distance * distance) / (0.055 * heatSpread));
      heat += amplitude * influence;
      totalWeight += influence;
    }

    const normalizedHeat = totalWeight > 0 ? THREE.MathUtils.clamp(heat / totalWeight, 0, 1) : 0;
    mixedColor.copy(baseColor).lerp(getHeatColor(normalizedHeat), normalizedHeat * 0.92);
    colorAttribute.setXYZ(i, mixedColor.r, mixedColor.g, mixedColor.b);
  }

  colorAttribute.needsUpdate = true;
}

function getHeatColor(activity: number) {
  const color = new THREE.Color();
  if (activity < 0.33) {
    color.setHSL(0.61 - activity * 0.16, 0.95, 0.52 + activity * 0.08);
    return color;
  }
  if (activity < 0.66) {
    const mid = (activity - 0.33) / 0.33;
    color.setHSL(0.16 - mid * 0.07, 1, 0.56);
    return color;
  }
  const hot = (activity - 0.66) / 0.34;
  color.setHSL(0.06 - hot * 0.06, 1, 0.54 + hot * 0.08);
  return color;
}
