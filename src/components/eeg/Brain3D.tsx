import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, Html } from "@react-three/drei";
import * as THREE from "three";
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

function HeadMesh({ mode }: { mode: "headset" | "brain" }) {
  if (mode === "brain") {
    return (
      <group>
        {/* Brain-ish mesh: two hemisphere spheres squished */}
        <mesh position={[-0.18, 0, 0]} scale={[0.85, 0.8, 1]}>
          <sphereGeometry args={[0.85, 48, 48]} />
          <meshStandardMaterial color="hsl(340, 40%, 68%)" roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh position={[0.18, 0, 0]} scale={[0.85, 0.8, 1]}>
          <sphereGeometry args={[0.85, 48, 48]} />
          <meshStandardMaterial color="hsl(340, 40%, 68%)" roughness={0.85} metalness={0.05} />
        </mesh>
        {/* Cerebellum */}
        <mesh position={[0, -0.55, -0.55]} scale={[0.6, 0.4, 0.4]}>
          <sphereGeometry args={[0.7, 32, 32]} />
          <meshStandardMaterial color="hsl(340, 35%, 58%)" roughness={0.85} />
        </mesh>
      </group>
    );
  }
  // Headset / scalp: translucent sphere with a subtle wireframe
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.96, 48, 48]} />
        <meshStandardMaterial
          color="hsl(210, 70%, 35%)"
          transparent
          opacity={0.25}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.965, 24, 24]} />
        <meshBasicMaterial color="hsl(195, 100%, 78%)" wireframe transparent opacity={0.18} />
      </mesh>
      {/* Nose indicator */}
      <mesh position={[0, 0.25, 0.95]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.05, 0.15, 16]} />
        <meshStandardMaterial color="hsl(195, 100%, 78%)" />
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
  const ref = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(() => {
    if (!ref.current) return;
    const s = 0.04 + Math.min(1, amplitude) * 0.06;
    ref.current.scale.setScalar(s / 0.05); // base radius 0.05
    const mat = ref.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.3 + Math.min(1, amplitude) * 2.2;
    if (lightRef.current) lightRef.current.intensity = Math.min(1.2, amplitude * 1.2);
  });

  const color = new THREE.Color().setHSL(0.55 - Math.min(1, amplitude) * 0.15, 1, 0.65);

  return (
    <group position={position}>
      <Sphere ref={ref} args={[0.05, 24, 24]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </Sphere>
      <pointLight ref={lightRef} color={color} distance={0.6} intensity={0.4} />
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
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[2, 3, 2]} intensity={0.8} />
      <directionalLight position={[-2, -1, -1]} intensity={0.25} color="hsl(220, 100%, 78%)" />
      <HeadMesh mode={mode} />
      {electrodes.map((e, i) => (
        <Electrode key={e.label + i} position={e.position} label={e.label} amplitude={amplitudes[i] ?? 0} />
      ))}
      <OrbitControls enablePan={false} minDistance={2} maxDistance={5} />
    </>
  );
}

export function Brain3D({ recording, currentTime, mode }: Props) {
  const electrodes = useMemo<ElectrodeData[]>(() => {
    const out: ElectrodeData[] = [];
    recording.channels.forEach((ch, idx) => {
      const pos = resolveElectrodePosition(ch.label);
      if (pos) out.push({ label: ch.label, position: pos, channelIdx: idx });
    });
    return out;
  }, [recording]);

  // Amplitude per electrode at the current time — average abs over a small window.
  const amplitudes = useMemo(() => {
    const win = Math.floor(recording.sampleRate * 0.25); // 250ms window
    const center = Math.floor(currentTime * recording.sampleRate);
    return electrodes.map((e) => {
      const ch = recording.channels[e.channelIdx];
      const range = Math.max(1, Math.abs(ch.max - ch.min));
      let sum = 0;
      let n = 0;
      const from = Math.max(0, center - win);
      const to = Math.min(ch.data.length, center + win);
      for (let i = from; i < to; i++) { sum += Math.abs(ch.data[i]); n++; }
      const avg = n ? sum / n : 0;
      return Math.min(1, (avg / (range * 0.5)) * 1.2);
    });
  }, [electrodes, recording, currentTime]);

  return (
    <Canvas camera={{ position: [0, 0.4, 3], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={["#040816"]} />
      <Scene electrodes={electrodes} amplitudes={amplitudes} mode={mode} />
    </Canvas>
  );
}
