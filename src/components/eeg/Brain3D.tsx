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
  mode: "headset" | "brain";
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
}: {
  mode: "headset" | "brain";
  globalActivity: number;
}) {
  const shellRef = useRef<THREE.Mesh>(null);
  const shellMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const shellWireRef = useRef<THREE.MeshBasicMaterial>(null);
  const leftHemisphereRef = useRef<THREE.Mesh>(null);
  const rightHemisphereRef = useRef<THREE.Mesh>(null);
  const cerebellumRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const smoothedActivity = useRef(globalActivity);

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
  });

  if (mode === "brain") {
    return (
      <group>
        <mesh ref={glowRef} scale={1.02}>
          <sphereGeometry args={[1.06, 48, 48]} />
          <meshBasicMaterial color={ACTIVITY_COLOR} transparent opacity={0.08} depthWrite={false} />
        </mesh>
        <mesh ref={leftHemisphereRef} position={[-0.18, 0, 0]} scale={[0.85, 0.8, 1]}>
          <sphereGeometry args={[0.85, 48, 48]} />
          <meshStandardMaterial color={BASE_BRAIN_COLOR} roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh ref={rightHemisphereRef} position={[0.18, 0, 0]} scale={[0.85, 0.8, 1]}>
          <sphereGeometry args={[0.85, 48, 48]} />
          <meshStandardMaterial color={BASE_BRAIN_COLOR} roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh ref={cerebellumRef} position={[0, -0.55, -0.55]} scale={[0.6, 0.4, 0.4]}>
          <sphereGeometry args={[0.7, 32, 32]} />
          <meshStandardMaterial color={BASE_CEREBELLUM_COLOR} roughness={0.85} />
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
}: {
  position: [number, number, number];
  label: string;
  amplitude: number;
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
    const pulse = 0.6 + Math.sin(performance.now() * 0.01 + position[0] * 8 + position[1] * 6) * 0.4;
    const glow = activity * (0.75 + pulse * 0.25);
    const scale = 0.04 + glow * 0.1;

    if (coreRef.current) {
      coreRef.current.scale.setScalar(scale / 0.05);
    }
    if (materialRef.current) {
      materialRef.current.color.copy(ACTIVITY_COLOR).lerp(SECONDARY_ACTIVITY_COLOR, glow * 0.45);
      materialRef.current.emissive.copy(ACTIVITY_COLOR);
      materialRef.current.emissiveIntensity = 0.45 + glow * 4.8;
      materialRef.current.roughness = 0.18 + (1 - glow) * 0.25;
      materialRef.current.metalness = 0.25 + glow * 0.35;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 0.5 + glow * 3.4;
      lightRef.current.distance = 0.7 + glow * 1.1;
    }
    if (haloRef.current) {
      haloRef.current.scale.setScalar(1 + glow * 2.6);
      const haloMaterial = haloRef.current.material as THREE.MeshBasicMaterial;
      haloMaterial.opacity = 0.08 + glow * 0.2;
    }
    if (beamRef.current) {
      beamRef.current.scale.set(1 + glow * 0.8, 0.75 + glow * 1.6, 1 + glow * 0.8);
      const beamMaterial = beamRef.current.material as THREE.MeshBasicMaterial;
      beamMaterial.opacity = 0.06 + glow * 0.18;
    }
  });

  return (
    <group position={position}>
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.08, 18, 18]} />
        <meshBasicMaterial color={ACTIVITY_COLOR} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <mesh ref={beamRef} position={[0, position[1] >= 0 ? 0.18 : -0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.08, 0.32, 24, 1, true]} />
        <meshBasicMaterial color={ACTIVITY_COLOR} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <Sphere ref={coreRef} args={[0.05, 24, 24]}>
        <meshStandardMaterial ref={materialRef} color={ACTIVITY_COLOR} emissive={ACTIVITY_COLOR} emissiveIntensity={1} />
      </Sphere>
      <pointLight ref={lightRef} color={ACTIVITY_COLOR} distance={1} intensity={0.8} />
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
    </group>
  );
}

function Scene({
  electrodes,
  amplitudes,
  mode,
}: {
  electrodes: ElectrodeData[];
  amplitudes: number[];
  mode: "headset" | "brain";
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
      <ReactiveHeadMesh mode={mode} globalActivity={globalActivity} />
      {electrodes.map((electrode, index) => (
        <Electrode
          key={`${electrode.label}-${index}`}
          position={electrode.position}
          label={electrode.label}
          amplitude={amplitudes[index] ?? 0}
        />
      ))}
      <OrbitControls enablePan={false} minDistance={2} maxDistance={5} />
    </>
  );
}

export function Brain3D({ recording, currentTime, mode }: Props) {
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
    return electrodes.map((electrode) => byChannel[electrode.channelIdx]?.activity ?? 0);
  }, [currentTime, electrodes, recording]);

  return (
    <Canvas camera={{ position: [0, 0.4, 3], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={["#040816"]} />
      <Scene electrodes={electrodes} amplitudes={amplitudes} mode={mode} />
    </Canvas>
  );
}
