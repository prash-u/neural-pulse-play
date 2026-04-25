export type SandboxMode = "tremor" | "stabilized";

export type Neuron = {
  id: string;
  x: number;
  y: number;
  activation: number;
  threshold: number;
  refractoryMs: number;
  lastFiredAt: number;
};

export type Edge = {
  from: string;
  to: string;
  weight: number;
};

export interface StimulationSettings {
  amplitude: number;
  frequency: number;
  pulseWidth: number;
  radius: number;
  noiseSeverity: number;
  enabled: boolean;
  mode: SandboxMode;
  electrodeId: string;
}

export interface SimulationPreset {
  neurons: Neuron[];
  edges: Edge[];
  stimulation: StimulationSettings;
  mode: "dbs" | "eeg" | "stress" | "routing";
}

export interface SimulationState {
  neurons: Neuron[];
  edges: Edge[];
  stimulation: StimulationSettings;
  elapsedMs: number;
  recentFirings: { neuronId: string; at: number }[];
}

export interface SimulationMetrics {
  firingRate: number;
  synchrony: number;
  tremorIndex: number;
  stimulationDose: number;
  overloadRisk: number;
  networkEntropy: number;
}

const FIRING_WINDOW_MS = 1200;

export function createBasalGangliaLoopPreset(): SimulationPreset {
  const positions = [
    ["cortex-l", -0.72, 0.22],
    ["cortex-r", 0.72, 0.22],
    ["striatum-l", -0.42, -0.02],
    ["striatum-r", 0.42, -0.02],
    ["gpe-l", -0.2, -0.2],
    ["gpe-r", 0.2, -0.2],
    ["gpi-l", -0.08, -0.38],
    ["gpi-r", 0.08, -0.38],
    ["stn", 0, -0.08],
    ["thalamus", 0, 0.26],
    ["motor", 0, 0.58],
    ["dbs", 0, -0.32],
  ] as const;

  const neurons: Neuron[] = positions.map(([id, x, y], index) => ({
    id,
    x,
    y,
    activation: index === 10 ? 0.4 : 0.2,
    threshold: id === "motor" ? 0.88 : 0.78,
    refractoryMs: id.includes("dbs") ? 80 : 160,
    lastFiredAt: -10_000,
  }));

  const edges: Edge[] = [
    ["cortex-l", "striatum-l", 0.22],
    ["cortex-r", "striatum-r", 0.22],
    ["striatum-l", "gpe-l", 0.18],
    ["striatum-r", "gpe-r", 0.18],
    ["gpe-l", "stn", 0.16],
    ["gpe-r", "stn", 0.16],
    ["stn", "gpi-l", 0.25],
    ["stn", "gpi-r", 0.25],
    ["gpi-l", "thalamus", 0.22],
    ["gpi-r", "thalamus", 0.22],
    ["thalamus", "motor", 0.28],
    ["motor", "cortex-l", 0.18],
    ["motor", "cortex-r", 0.18],
    ["dbs", "stn", 0.4],
    ["dbs", "gpi-l", 0.3],
    ["dbs", "gpi-r", 0.3],
  ].map(([from, to, weight]) => ({ from, to, weight }));

  return {
    neurons,
    edges,
    stimulation: {
      amplitude: 0.84,
      frequency: 130,
      pulseWidth: 90,
      radius: 0.42,
      noiseSeverity: 0.62,
      enabled: true,
      mode: "tremor",
      electrodeId: "dbs",
    },
    mode: "dbs",
  };
}

export function createSimulationState(preset: SimulationPreset): SimulationState {
  return {
    neurons: preset.neurons.map((neuron) => ({ ...neuron })),
    edges: [...preset.edges],
    stimulation: { ...preset.stimulation },
    elapsedMs: 0,
    recentFirings: [],
  };
}

export function stepSimulation(state: SimulationState, dtMs: number): SimulationState {
  const elapsedMs = state.elapsedMs + dtMs;
  const pulse = state.stimulation.enabled
    ? computePulseTrain(elapsedMs, state.stimulation.frequency, state.stimulation.pulseWidth)
    : 0;
  const stimNeuron = state.neurons.find((neuron) => neuron.id === state.stimulation.electrodeId);
  const inputByNeuron = new Map<string, number>();
  const doseLoad = clamp(
    (state.stimulation.amplitude * state.stimulation.frequency * state.stimulation.pulseWidth) / 18_000,
    0,
    1.6,
  );

  for (const neuron of state.neurons) inputByNeuron.set(neuron.id, 0);

  for (const edge of state.edges) {
    const fromNeuron = state.neurons.find((neuron) => neuron.id === edge.from);
    if (!fromNeuron) continue;
    const firedRecently = elapsedMs - fromNeuron.lastFiredAt < 160;
    if (!firedRecently) continue;
    inputByNeuron.set(edge.to, (inputByNeuron.get(edge.to) ?? 0) + edge.weight * 0.55);
  }

  const neurons = state.neurons.map((neuron) => {
    const distance = stimNeuron ? Math.hypot(neuron.x - stimNeuron.x, neuron.y - stimNeuron.y) : 1;
    const distanceFalloff = 1 / (1 + Math.pow(distance / Math.max(0.08, state.stimulation.radius), 2.2));
    const stimulation = state.stimulation.amplitude * pulse * distanceFalloff;
    const networkInput = inputByNeuron.get(neuron.id) ?? 0;
    const tremorScale = state.stimulation.mode === "tremor" ? 1 : 0.48;
    const tremorNoise =
      (
        Math.sin((elapsedMs / 1000) * 2 * Math.PI * 4.6 + neuron.x * 4.2) * 0.07 +
        Math.sin((elapsedMs / 1000) * 2 * Math.PI * 7.8 + neuron.y * 3.7) * 0.035
      ) *
      state.stimulation.noiseSeverity *
      tremorScale;
    const stabilization =
      state.stimulation.enabled
        ? clamp(state.stimulation.amplitude * state.stimulation.frequency / 1800, 0, 0.16) * distanceFalloff
        : 0;
    const overloadExcitation = doseLoad > 0.92 ? (doseLoad - 0.92) * 0.2 * (0.55 + distanceFalloff) : 0;
    const refractory = elapsedMs - neuron.lastFiredAt < neuron.refractoryMs;
    let activation = neuron.activation * (refractory ? 0.84 : 0.95);

    activation += networkInput + tremorNoise + stimulation + overloadExcitation - stabilization;
    activation = clamp(activation, 0, 1.25);

    let lastFiredAt = neuron.lastFiredAt;
    if (!refractory && activation >= neuron.threshold) {
      activation = 0.14;
      lastFiredAt = elapsedMs;
    }

    return {
      ...neuron,
      activation,
      lastFiredAt,
    };
  });

  const recentFirings = [
    ...state.recentFirings.filter((event) => elapsedMs - event.at < FIRING_WINDOW_MS),
    ...neurons
      .filter((neuron) => neuron.lastFiredAt === elapsedMs)
      .map((neuron) => ({ neuronId: neuron.id, at: elapsedMs })),
  ];

  return {
    ...state,
    neurons,
    elapsedMs,
    recentFirings,
  };
}

export function computeSimulationMetrics(state: SimulationState): SimulationMetrics {
  const activeFirings = state.recentFirings.filter((event) => state.elapsedMs - event.at < FIRING_WINDOW_MS);
  const firingRate = activeFirings.length / (FIRING_WINDOW_MS / 1000);

  const activations = state.neurons.map((neuron) => neuron.activation);
  const mean = activations.reduce((sum, value) => sum + value, 0) / Math.max(1, activations.length);
  const variance = activations.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / Math.max(1, activations.length);
  const synchrony = clamp(1 - Math.sqrt(variance), 0, 1);

  const motorNodes = state.neurons.filter((neuron) => neuron.id.includes("motor") || neuron.id.includes("thalamus"));
  const tremorIndex = clamp(
    motorNodes.reduce((sum, neuron) => sum + neuron.activation, 0) / Math.max(1, motorNodes.length) *
      (state.stimulation.mode === "tremor" ? 1.2 : 0.78),
    0,
    1,
  );

  const stimulationDose = clamp(
    (state.stimulation.amplitude *
      state.stimulation.frequency *
      state.stimulation.pulseWidth *
      state.stimulation.radius *
      (state.stimulation.enabled ? 1 : 0.25)) / 5000,
    0,
    1,
  );
  const overloadRisk = clamp(
    stimulationDose * 0.72 +
      Math.max(0, mean - 0.58) * 0.85 +
      state.stimulation.noiseSeverity * 0.16,
    0,
    1,
  );

  const networkEntropy = computeEntropy(activations);

  return {
    firingRate,
    synchrony,
    tremorIndex,
    stimulationDose,
    overloadRisk,
    networkEntropy,
  };
}

function computePulseTrain(elapsedMs: number, frequency: number, pulseWidth: number) {
  const period = 1000 / Math.max(1, frequency);
  const phase = elapsedMs % period;
  return phase <= pulseWidth ? 1 : 0;
}

function computeEntropy(values: number[]) {
  const total = values.reduce((sum, value) => sum + Math.max(value, 0.001), 0);
  let entropy = 0;
  for (const value of values) {
    const probability = Math.max(value, 0.001) / total;
    entropy -= probability * Math.log2(probability);
  }
  return clamp(entropy / Math.log2(Math.max(2, values.length)), 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
