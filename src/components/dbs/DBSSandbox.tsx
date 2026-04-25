import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Gauge, HeartPulse, RadioTower, ShieldAlert, Zap } from "lucide-react";
import { MainWorkspace, Panel, StickyControlRail, AppShell } from "@/components/layout/WorkspaceShell";
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
    <AppShell className="mt-1">
      <MainWorkspace>
        <Panel
          className="overflow-hidden p-0"
          style={{
            borderColor: "hsl(340 85% 72% / 0.12)",
            background: "linear-gradient(180deg, hsl(341 50% 9% / 0.82), hsl(224 60% 5% / 0.82))",
          }}
        >
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow !text-[hsl(340_88%_74%)]">Educational simulation</p>
                <h2 className="font-display mt-1 text-[clamp(1.6rem,2.4vw,2.2rem)]">Basal Ganglia Loop</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Explore how rhythmic stimulation can calm unstable activity or push the loop into overload.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateStimulation({ enabled: !simulation.stimulation.enabled })}
                  className={simulation.stimulation.enabled ? "pill-button pill-button-primary !min-h-[40px]" : "pill-button pill-button-secondary !min-h-[40px]"}
                >
                  <Zap className="h-4 w-4" />
                  {simulation.stimulation.enabled ? "Stimulation on" : "Stimulation off"}
                </button>
                <button type="button" onClick={() => setIsRunning((value) => !value)} className="pill-button pill-button-secondary !min-h-[40px]">
                  <Activity className="h-4 w-4" />
                  {isRunning ? "Pause sim" : "Run sim"}
                </button>
                <button type="button" onClick={reset} className="pill-button pill-button-secondary !min-h-[40px]">
                  Reset loop
                </button>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-6">
            <NetworkView
              simulation={simulation}
              metrics={metrics}
              onSelectElectrode={(electrodeId) => updateStimulation({ electrodeId })}
            />
          </div>
        </Panel>
      </MainWorkspace>

      <StickyControlRail>
        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip !normal-case !tracking-normal">
              Active contact {simulation.stimulation.electrodeId.toUpperCase()}
            </span>
            <span className={`status-chip ${simulation.stimulation.enabled ? "ready" : "loading"} !normal-case !tracking-normal`}>
              {simulation.stimulation.enabled ? "Rhythmic stimulation" : "Baseline tremor"}
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            <MetricRow icon={ShieldAlert} label="Tremor index" value={`${Math.round(metrics.tremorIndex * 100)}%`} />
            <MetricRow icon={RadioTower} label="Network synchrony" value={`${Math.round(metrics.synchrony * 100)}%`} />
            <MetricRow icon={Zap} label="Stimulation dose" value={`${Math.round(metrics.stimulationDose * 100)}%`} />
            <MetricRow icon={Gauge} label="Overload risk" value={`${Math.round(metrics.overloadRisk * 100)}%`} />
            <MetricRow icon={HeartPulse} label="Firing rate" value={`${metrics.firingRate.toFixed(1)} Hz`} />
          </div>
        </Panel>

        <Panel>
          <div>
            <p className="eyebrow">DBS controls</p>
            <h3 className="font-display mt-1 text-xl">Pulse engine</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tune the loop like a polished sandbox: more noise produces unstable firing, while aggressive settings can overshoot into overload.
            </p>
          </div>

          <div className="mt-4 space-y-4">
            <SandboxSlider label="Stimulation amplitude" value={simulation.stimulation.amplitude} min={0.2} max={1.5} step={0.02} display={`${simulation.stimulation.amplitude.toFixed(2)}`} onChange={(value) => updateStimulation({ amplitude: value })} />
            <SandboxSlider label="Frequency" value={simulation.stimulation.frequency} min={20} max={185} step={1} display={`${Math.round(simulation.stimulation.frequency)} Hz`} onChange={(value) => updateStimulation({ frequency: value })} />
            <SandboxSlider label="Pulse width" value={simulation.stimulation.pulseWidth} min={30} max={180} step={2} display={`${Math.round(simulation.stimulation.pulseWidth)} μs`} onChange={(value) => updateStimulation({ pulseWidth: value })} />
            <SandboxSlider label="Electrode radius" value={simulation.stimulation.radius} min={0.16} max={0.84} step={0.01} display={`${simulation.stimulation.radius.toFixed(2)}`} onChange={(value) => updateStimulation({ radius: value })} />
            <SandboxSlider label="Noise / tremor severity" value={simulation.stimulation.noiseSeverity} min={0.1} max={1} step={0.01} display={`${Math.round(simulation.stimulation.noiseSeverity * 100)}%`} onChange={(value) => updateStimulation({ noiseSeverity: value })} />

            <div className="grid grid-cols-2 gap-2">
              {(["tremor", "stabilized"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateStimulation({ mode })}
                  className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors ${
                    simulation.stimulation.mode === mode ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground"
                  }`}
                >
                  {mode === "tremor" ? "Tremor noise" : "Stabilised"}
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </StickyControlRail>
    </AppShell>
  );
}

function NetworkView({
  simulation,
  metrics,
  onSelectElectrode,
}: {
  simulation: SimulationState;
  metrics: ReturnType<typeof computeSimulationMetrics>;
  onSelectElectrode: (electrodeId: string) => void;
}) {
  const nodeMap = new Map(simulation.neurons.map((neuron) => [neuron.id, neuron]));
  const stimNode = nodeMap.get(simulation.stimulation.electrodeId);
  const period = 1000 / Math.max(1, simulation.stimulation.frequency);
  const pulsePhase = (simulation.elapsedMs % period) / period;
  const pulseAlpha = simulation.stimulation.enabled ? Math.max(0, 1 - pulsePhase) : 0;

  return (
    <div
      className="relative overflow-hidden rounded-[1.75rem] border"
      style={{
        borderColor: "hsl(215 30% 70% / 0.14)",
        background:
          "radial-gradient(circle at top, hsl(340 92% 72% / 0.14), transparent 30%), radial-gradient(circle at bottom, hsl(195 100% 72% / 0.12), transparent 42%), #050917",
        minHeight: 540,
      }}
    >
      <div className="absolute inset-x-6 top-5 z-10 flex flex-wrap gap-2">
        <span className="status-chip !normal-case !tracking-normal">Educational sandbox</span>
        <span className={`status-chip ${metrics.overloadRisk > 0.7 ? "error" : metrics.tremorIndex > 0.55 ? "loading" : "ready"} !normal-case !tracking-normal`}>
          {metrics.overloadRisk > 0.7 ? "High overload risk" : metrics.tremorIndex > 0.55 ? "Unstable loop" : "Suppressed tremor"}
        </span>
      </div>

      <svg viewBox="-1.1 -0.95 2.2 1.95" className="h-full w-full">
        <defs>
          <radialGradient id="stimGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(248,113,113,0.82)" />
            <stop offset="100%" stopColor="rgba(248,113,113,0)" />
          </radialGradient>
          <radialGradient id="suppressionGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.3)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </radialGradient>
        </defs>

        {stimNode ? (
          <>
            <circle
              cx={stimNode.x}
              cy={stimNode.y}
              r={simulation.stimulation.radius * 0.66}
              fill={metrics.tremorIndex < 0.45 ? "url(#suppressionGlow)" : "url(#stimGlow)"}
              opacity={simulation.stimulation.enabled ? 0.9 : 0.4}
            />
            {simulation.stimulation.enabled && (
              <>
                <circle
                  cx={stimNode.x}
                  cy={stimNode.y}
                  r={0.14 + pulsePhase * simulation.stimulation.radius * 0.9}
                  fill="none"
                  stroke="rgba(248,113,113,0.55)"
                  strokeWidth={0.012}
                  opacity={pulseAlpha}
                />
                <circle
                  cx={stimNode.x}
                  cy={stimNode.y}
                  r={0.08 + pulsePhase * simulation.stimulation.radius * 0.54}
                  fill="none"
                  stroke="rgba(125,211,252,0.55)"
                  strokeWidth={0.01}
                  opacity={pulseAlpha * 0.9}
                />
              </>
            )}
          </>
        ) : null}

        {simulation.edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const activity = (from.activation + to.activation) / 2;
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={`hsla(${metrics.overloadRisk > 0.72 ? 4 : 202}, 100%, ${62 + activity * 18}%, ${0.18 + activity * 0.24})`}
              strokeWidth={0.01 + edge.weight * 0.03 + activity * 0.008}
            />
          );
        })}

        {simulation.neurons.map((neuron) => {
          const isElectrode = neuron.id === simulation.stimulation.electrodeId;
          const glow = Math.min(1, neuron.activation);
          const isOverloaded = metrics.overloadRisk > 0.7 && glow > 0.72;
          const color = isElectrode
            ? `hsl(${5 - glow * 8} 100% ${63 + glow * 8}%)`
            : isOverloaded
              ? `hsl(${8 + glow * 14} 92% ${58 + glow * 8}%)`
              : `hsl(${204 - glow * 110} 96% ${56 + glow * 12}%)`;

          return (
            <g key={neuron.id} onClick={() => onSelectElectrode(neuron.id)} className="cursor-pointer">
              <circle
                cx={neuron.x}
                cy={neuron.y}
                r={0.042 + glow * 0.026}
                fill={color}
                stroke={isElectrode ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)"}
                strokeWidth={isElectrode ? 0.012 : 0.006}
              />
              <circle
                cx={neuron.x}
                cy={neuron.y}
                r={0.07 + glow * 0.03}
                fill={color}
                opacity={0.1 + glow * 0.08}
              />
              <text
                x={neuron.x}
                y={neuron.y - 0.085}
                textAnchor="middle"
                fill="rgba(230,238,255,0.86)"
                fontSize="0.055"
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
    <label className="block space-y-2">
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

function MetricRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="activity-row">
      <Icon className="h-4 w-4 text-primary" />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className="text-xs font-mono text-muted-foreground">{value}</span>
    </div>
  );
}
