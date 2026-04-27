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
  suppressionScore: number;
  networkEntropy: number;
}

export type DBSScenarioId = "parkinsonian" | "underpowered" | "therapeutic-window" | "overdriven";

export interface DBSScenarioPreset {
  id: DBSScenarioId;
  label: string;
  summary: string;
  description: string;
  preset: SimulationPreset;
}

export interface StimulationAnalysis {
  stateLabel: "underpowered" | "therapeutic" | "overdriven" | "suppressed";
  effectiveness: number;
  suppressionPotential: number;
  overloadDrive: number;
  parameterEffects: {
    label: string;
    status: "low" | "good" | "high";
    detail: string;
  }[];
  teachingPoints: string[];
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

export function createScenarioPresets(): DBSScenarioPreset[] {
  return [
    {
      id: "parkinsonian",
      label: "Parkinsonian tremor",
      summary: "High tremor, no active stimulation",
      description: "The loop starts noisy and unstable so you can see the baseline problem before dialing in a suppressive setting.",
      preset: withScenario(createBasalGangliaLoopPreset(), {
        enabled: false,
        mode: "tremor",
        noiseSeverity: 0.86,
        amplitude: 0.62,
        frequency: 80,
        pulseWidth: 70,
        radius: 0.34,
      }),
    },
    {
      id: "underpowered",
      label: "Under-tuned DBS",
      summary: "Stimulation is on, but not enough to suppress tremor",
      description: "Useful for teaching why simply turning stimulation on is not the same as landing inside a therapeutic window.",
      preset: withScenario(createBasalGangliaLoopPreset(), {
        enabled: true,
        mode: "tremor",
        noiseSeverity: 0.72,
        amplitude: 0.48,
        frequency: 62,
        pulseWidth: 54,
        radius: 0.24,
      }),
    },
    {
      id: "therapeutic-window",
      label: "Therapeutic window",
      summary: "Near the suppressive sweet spot",
      description: "A balanced starting point showing that tremor can be reduced without immediately tipping into overload.",
      preset: withScenario(createBasalGangliaLoopPreset(), {
        enabled: true,
        mode: "tremor",
        noiseSeverity: 0.64,
        amplitude: 0.86,
        frequency: 128,
        pulseWidth: 94,
        radius: 0.42,
      }),
    },
    {
      id: "overdriven",
      label: "Overdriven DBS",
      summary: "Aggressive stimulation causes off-target instability",
      description: "Shows that more current or frequency is not automatically better once overload starts to dominate.",
      preset: withScenario(createBasalGangliaLoopPreset(), {
        enabled: true,
        mode: "tremor",
        noiseSeverity: 0.68,
        amplitude: 1.34,
        frequency: 178,
        pulseWidth: 154,
        radius: 0.7,
      }),
    },
  ];
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
  const analysis = analyzeStimulation(state.stimulation);
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
    const nodeSensitivity = getNodeSensitivity(neuron.id);
    const therapeuticCoupling = analysis.effectiveness * distanceFalloff * nodeSensitivity;
    const stimulation = state.stimulation.amplitude * pulse * distanceFalloff * (0.8 + analysis.effectiveness * 0.45);
    const networkInput = inputByNeuron.get(neuron.id) ?? 0;
    const tremorScale = state.stimulation.mode === "tremor" ? 1 : 0.48;
    const tremorNoise =
      (
        Math.sin((elapsedMs / 1000) * 2 * Math.PI * 4.6 + neuron.x * 4.2) * 0.07 +
        Math.sin((elapsedMs / 1000) * 2 * Math.PI * 7.8 + neuron.y * 3.7) * 0.035
      ) *
      state.stimulation.noiseSeverity *
      tremorScale *
      (1 - analysis.suppressionPotential * 0.82 * nodeSensitivity);
    const stabilization =
      state.stimulation.enabled
        ? (0.04 + analysis.suppressionPotential * 0.22) * distanceFalloff * nodeSensitivity
        : 0;
    const overloadExcitation =
      (doseLoad > 0.92 ? (doseLoad - 0.92) * 0.2 : 0) +
      analysis.overloadDrive * 0.24 * (0.48 + distanceFalloff);
    const refractory = elapsedMs - neuron.lastFiredAt < neuron.refractoryMs;
    let activation = neuron.activation * (refractory ? 0.84 : 0.95);

    activation += networkInput + tremorNoise + stimulation + overloadExcitation - stabilization - therapeuticCoupling * 0.08;
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
  const analysis = analyzeStimulation(state.stimulation);
  const activeFirings = state.recentFirings.filter((event) => state.elapsedMs - event.at < FIRING_WINDOW_MS);
  const firingRate = activeFirings.length / (FIRING_WINDOW_MS / 1000);

  const activations = state.neurons.map((neuron) => neuron.activation);
  const mean = activations.reduce((sum, value) => sum + value, 0) / Math.max(1, activations.length);
  const variance = activations.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / Math.max(1, activations.length);
  const synchrony = clamp(1 - Math.sqrt(variance), 0, 1);

  const motorNodes = state.neurons.filter((neuron) => neuron.id.includes("motor") || neuron.id.includes("thalamus"));
  const tremorIndex = clamp(
    motorNodes.reduce((sum, neuron) => sum + neuron.activation, 0) / Math.max(1, motorNodes.length) *
      (state.stimulation.mode === "tremor" ? 1.2 : 0.78) *
      (1 - analysis.suppressionPotential * 0.32),
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
      state.stimulation.noiseSeverity * 0.16 +
      analysis.overloadDrive * 0.42,
    0,
    1,
  );
  const suppressionScore = clamp(
    analysis.suppressionPotential * (1 - overloadRisk * 0.48) * (1 - tremorIndex * 0.45),
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
    suppressionScore,
    networkEntropy,
  };
}

export function analyzeStimulation(stimulation: StimulationSettings): StimulationAnalysis {
  const amplitudeWindow = gradeWindow(stimulation.amplitude, 0.68, 0.96, 1.14);
  const frequencyWindow = gradeWindow(stimulation.frequency, 95, 130, 160);
  const pulseWidthWindow = gradeWindow(stimulation.pulseWidth, 65, 95, 125);
  const radiusWindow = gradeWindow(stimulation.radius, 0.26, 0.42, 0.56);
  const enabledFactor = stimulation.enabled ? 1 : 0;

  const effectiveness = enabledFactor * clamp(
    amplitudeWindow.goodness * 0.28 +
      frequencyWindow.goodness * 0.34 +
      pulseWidthWindow.goodness * 0.22 +
      radiusWindow.goodness * 0.16,
    0,
    1,
  );

  const overloadDrive = enabledFactor * clamp(
    amplitudeWindow.excess * 0.32 +
      frequencyWindow.excess * 0.3 +
      pulseWidthWindow.excess * 0.18 +
      Math.max(0, stimulation.noiseSeverity - 0.72) * 0.16 +
      Math.max(0, radiusWindow.excess - 0.15) * 0.1,
    0,
    1,
  );

  const suppressionPotential = clamp(
    effectiveness * (1 - overloadDrive * 0.55) * (0.92 - Math.max(0, stimulation.noiseSeverity - 0.72) * 0.28),
    0,
    1,
  );

  const parameterEffects: StimulationAnalysis["parameterEffects"] = [
    describeParameter("Amplitude", amplitudeWindow, "Enough current to recruit the loop", "Too much current pushes the loop toward overload"),
    describeParameter("Frequency", frequencyWindow, "Rhythmic entrainment matches typical suppressive DBS cadence", "High-frequency driving is becoming destabilising"),
    describeParameter("Pulse width", pulseWidthWindow, "Pulse width is wide enough to engage the target", "Very wide pulses start to spray energy beyond the target"),
    describeParameter("Radius", radiusWindow, "Field spread is covering the intended pathway", "Field spread is broad enough to hit off-target regions"),
  ];

  const teachingPoints = [
    !stimulation.enabled
      ? "Stimulation is off, so the network is only showing baseline tremor noise."
      : frequencyWindow.goodness < 0.45
        ? "Frequency is the main limiter right now. The loop is not being rhythmically entrained strongly enough."
        : null,
    amplitudeWindow.goodness < 0.4
      ? "Amplitude is too low to recruit a stable suppressive field."
      : null,
    overloadDrive > 0.45
      ? "The current parameter mix is trading suppression for overload. Try lowering amplitude, frequency, or pulse width."
      : null,
    suppressionPotential > 0.62 && overloadDrive < 0.3
      ? "This is close to a therapeutic sweet spot: enough rhythmic drive to calm tremor without destabilising the loop."
      : null,
  ].filter(Boolean) as string[];

  const stateLabel =
    !stimulation.enabled ? "underpowered"
    : suppressionPotential > 0.62 && overloadDrive < 0.32 ? "suppressed"
    : overloadDrive > 0.48 ? "overdriven"
    : effectiveness > 0.48 ? "therapeutic"
    : "underpowered";

  return {
    stateLabel,
    effectiveness,
    suppressionPotential,
    overloadDrive,
    parameterEffects,
    teachingPoints,
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

function withScenario(
  preset: SimulationPreset,
  patch: Partial<StimulationSettings>,
): SimulationPreset {
  return {
    ...preset,
    stimulation: {
      ...preset.stimulation,
      ...patch,
    },
  };
}

function getNodeSensitivity(id: string) {
  if (id.includes("motor") || id.includes("thalamus")) return 1.18;
  if (id.includes("stn") || id.includes("gpi")) return 1.04;
  if (id.includes("gpe") || id.includes("striatum")) return 0.88;
  return 0.72;
}

function gradeWindow(value: number, low: number, ideal: number, high: number) {
  const below = value < ideal ? 1 - (ideal - value) / Math.max(0.001, ideal - low) : 1;
  const above = value > ideal ? 1 - (value - ideal) / Math.max(0.001, high - ideal) : 1;
  const goodness = clamp(Math.min(below, above), 0, 1);
  const excess = value > high ? clamp((value - high) / Math.max(0.001, high), 0, 1) : 0;
  const deficit = value < low ? clamp((low - value) / Math.max(0.001, low), 0, 1) : 0;
  return { goodness, excess, deficit };
}

function describeParameter(
  label: string,
  window: { goodness: number; excess: number; deficit: number },
  goodDetail: string,
  highDetail: string,
) {
  if (window.deficit > 0.12) {
    return {
      label,
      status: "low" as const,
      detail: `${label} is currently underpowered.`,
    };
  }
  if (window.excess > 0.08) {
    return {
      label,
      status: "high" as const,
      detail: highDetail,
    };
  }
  return {
    label,
    status: "good" as const,
    detail: goodDetail,
  };
}
