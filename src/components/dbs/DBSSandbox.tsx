import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, HeartPulse, RadioTower, ShieldAlert, Zap } from "lucide-react";
import {
  computeSimulationMetrics,
  createBasalGangliaLoopPreset,
  createSimulationState,
  stepSimulation,
  type SimulationState,
  type StimulationSettings,
} from "@/lib/simulation/engine";

export function DBSSandbox() {
  const preset = useMemo(() => createBasalGangliaLoopPreset(), []);
  const [simulation, setSimulation] = useState<SimulationState>(() => createSimulationState(preset));
  const [isRunning, setIsRunning] = useState(true);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    const loop = (now: number) => {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dtMs = now - lastTickRef.current;
      lastTickRef.current = now;

      if (isRunning) {
        setSimulation((current) => stepSimulation(current, Math.min(dtMs, 42)));
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      lastTickRef.current = null;
    };
  }, [isRunning]);

  const metrics = useMemo(() => computeSimulationMetrics(simulation), [simulation]);

  const updateStimulation = (patch: Partial<StimulationSettings>) => {
    setSimulation((current) => ({
      ...current,
      stimulation: {
        ...current.stimulation,
        ...patch,
      },
    }));
  };

  const reset = () => {
    setSimulation(createSimulationState(preset));
    setIsRunning(true);
  };

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <article className="glass-panel p-6">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <p className="eyebrow">DBS sandbox</p>
            <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.35rem)] mt-1">Basal Ganglia Loop</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Place stimulation on the loop, suppress tremor noise, and watch the network stabilise in real time.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setIsRunning((value) => !value)} className="pill-button pill-button-primary !min-h-[40px]">
              <Activity className="h-4 w-4" />
              {isRunning ? "Pause sim" : "Run sim"}
            </button>
            <button type="button" onClick={reset} className="pill-button pill-button-secondary !min-h-[40px]">
              Reset loop
            </button>
          </div>
        </header>

        <NetworkView
          simulation={simulation}
          onSelectElectrode={(electrodeId) => updateStimulation({ electrodeId })}
        />
      </article>

      <aside className="space-y-5">
        <SandboxHud metrics={metrics} selectedElectrode={simulation.stimulation.electrodeId} />
        <StimulationControls
          stimulation={simulation.stimulation}
          onChange={updateStimulation}
        />
      </aside>
    </section>
  );
}

function NetworkView({
  simulation,
  onSelectElectrode,
}: {
  simulation: SimulationState;
  onSelectElectrode: (electrodeId: string) => void;
}) {
  const nodeMap = new Map(simulation.neurons.map((neuron) => [neuron.id, neuron]));

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border bg-[radial-gradient(circle_at_top,hsl(200_100%_67%_/_0.1),transparent_38%),#050a17]"
         style={{ borderColor: "hsl(215 30% 70% / 0.14)", minHeight: 520 }}>
      <svg viewBox="-1.1 -0.95 2.2 1.95" className="h-full w-full">
        <defs>
          <radialGradient id="stimGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(248,113,113,0.9)" />
            <stop offset="100%" stopColor="rgba(248,113,113,0)" />
          </radialGradient>
        </defs>

        <circle
          cx={nodeMap.get(simulation.stimulation.electrodeId)?.x ?? 0}
          cy={nodeMap.get(simulation.stimulation.electrodeId)?.y ?? 0}
          r={simulation.stimulation.radius * 0.62}
          fill="url(#stimGlow)"
        />

        {simulation.edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="rgba(145, 185, 255, 0.18)"
              strokeWidth={edge.weight * 0.02}
            />
          );
        })}

        {simulation.neurons.map((neuron) => {
          const isElectrode = neuron.id === simulation.stimulation.electrodeId;
          const glow = Math.min(1, neuron.activation);
          const color = isElectrode
            ? `hsl(${6 - glow * 6} 100% ${60 + glow * 10}%)`
            : `hsl(${210 - glow * 165} 95% ${50 + glow * 12}%)`;

          return (
            <g key={neuron.id} onClick={() => onSelectElectrode(neuron.id)} className="cursor-pointer">
              <circle
                cx={neuron.x}
                cy={neuron.y}
                r={0.045 + glow * 0.022}
                fill={color}
                stroke={isElectrode ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)"}
                strokeWidth={isElectrode ? 0.012 : 0.006}
              />
              <text
                x={neuron.x}
                y={neuron.y - 0.08}
                textAnchor="middle"
                fill="rgba(230,238,255,0.9)"
                fontSize="0.06"
                fontWeight="700"
              >
                {neuron.id.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SandboxHud({
  metrics,
  selectedElectrode,
}: {
  metrics: ReturnType<typeof computeSimulationMetrics>;
  selectedElectrode: string;
}) {
  const items = [
    { label: "Firing rate", value: `${metrics.firingRate.toFixed(1)} Hz`, icon: Activity },
    { label: "Synchrony", value: `${Math.round(metrics.synchrony * 100)}%`, icon: RadioTower },
    { label: "Tremor index", value: `${Math.round(metrics.tremorIndex * 100)}%`, icon: ShieldAlert },
    { label: "Stim dose", value: `${Math.round(metrics.stimulationDose * 100)}%`, icon: Zap },
    { label: "Entropy", value: `${Math.round(metrics.networkEntropy * 100)}%`, icon: HeartPulse },
  ];

  return (
    <div className="glass-panel p-6 space-y-4">
      <div>
        <p className="eyebrow">Sandbox HUD</p>
        <h3 className="font-display text-xl mt-1">Stimulation metrics</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Active electrode: <span className="text-foreground font-semibold">{selectedElectrode.toUpperCase()}</span>
        </p>
      </div>

      <div className="grid gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="activity-row">
              <Icon className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm font-semibold">{item.label}</span>
              <span className="text-xs font-mono text-muted-foreground">{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StimulationControls({
  stimulation,
  onChange,
}: {
  stimulation: StimulationSettings;
  onChange: (patch: Partial<StimulationSettings>) => void;
}) {
  return (
    <div className="glass-panel p-6 space-y-4">
      <div>
        <p className="eyebrow">Pulse engine</p>
        <h3 className="font-display text-xl mt-1">DBS parameters</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Dial pulse frequency, amplitude, width, and spatial radius the way you would in a neurostimulation sandbox.
        </p>
      </div>

      <SandboxSlider label="Amplitude" value={stimulation.amplitude} min={0.2} max={1.4} step={0.02} display={`${stimulation.amplitude.toFixed(2)}`} onChange={(value) => onChange({ amplitude: value })} />
      <SandboxSlider label="Frequency" value={stimulation.frequency} min={20} max={180} step={1} display={`${Math.round(stimulation.frequency)} Hz`} onChange={(value) => onChange({ frequency: value })} />
      <SandboxSlider label="Pulse width" value={stimulation.pulseWidth} min={30} max={160} step={2} display={`${Math.round(stimulation.pulseWidth)} μs`} onChange={(value) => onChange({ pulseWidth: value })} />
      <SandboxSlider label="Affected radius" value={stimulation.radius} min={0.16} max={0.8} step={0.01} display={`${stimulation.radius.toFixed(2)}`} onChange={(value) => onChange({ radius: value })} />

      <div className="grid grid-cols-2 gap-2">
        {(["tremor", "stabilized"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ mode })}
            className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors ${
              stimulation.mode === mode ? "bg-primary/15 text-primary border-primary/40" : "text-muted-foreground border-white/10"
            }`}
          >
            {mode === "tremor" ? "Tremor noise" : "Stabilised"}
          </button>
        ))}
      </div>
    </div>
  );
}

function SandboxSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2 block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs font-mono text-muted-foreground">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="viz-slider"
      />
    </label>
  );
}
