import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Gauge, HeartPulse, Info, RadioTower, ShieldAlert, Sparkles, Target, Zap } from "lucide-react";
import { MainWorkspace, Panel, StickyControlRail, AppShell } from "@/components/layout/WorkspaceShell";
import {
  analyzeStimulation,
  computeSimulationMetrics,
  createBasalGangliaLoopPreset,
  createScenarioPresets,
  createSimulationState,
  stepSimulation,
  type DBSScenarioPreset,
  type SimulationState,
  type StimulationSettings,
} from "@/lib/simulation/engine";

export function DBSSandbox() {
  const preset = useMemo(() => createBasalGangliaLoopPreset(), []);
  const scenarios = useMemo(() => createScenarioPresets(), []);
  const [simulation, setSimulation] = useState<SimulationState>(() => createSimulationState(scenarios[0]?.preset ?? preset));
  const [isRunning, setIsRunning] = useState(true);
  const [activeScenario, setActiveScenario] = useState<DBSScenarioPreset["id"] | "custom">("parkinsonian");
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
  const analysis = useMemo(() => analyzeStimulation(simulation.stimulation), [simulation.stimulation]);

  const updateStimulation = (patch: Partial<StimulationSettings>) => {
    setActiveScenario("custom");
    setSimulation((current) => ({
      ...current,
      stimulation: {
        ...current.stimulation,
        ...patch,
      },
    }));
  };

  const reset = () => {
    const scenarioPreset = scenarios.find((scenario) => scenario.id === activeScenario)?.preset ?? preset;
    setSimulation(createSimulationState(scenarioPreset));
    setIsRunning(true);
  };

  const applyScenario = (scenario: DBSScenarioPreset) => {
    setActiveScenario(scenario.id);
    setSimulation(createSimulationState(scenario.preset));
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

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => applyScenario(scenario)}
                  className={`rounded-[1.2rem] border px-4 py-3 text-left transition-colors ${
                    activeScenario === scenario.id ? "border-primary/40 bg-primary/12" : "border-white/10 bg-white/5 hover:border-primary/20"
                  }`}
                >
                  <div className="text-sm font-semibold text-foreground">{scenario.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{scenario.summary}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 md:p-6">
            <NetworkView
              simulation={simulation}
              metrics={metrics}
              analysis={analysis}
              onSelectElectrode={(electrodeId) => updateStimulation({ electrodeId })}
            />
          </div>
        </Panel>
      </MainWorkspace>

      <StickyControlRail>
        <Panel>
          <div className="rounded-[1.15rem] border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-foreground">
              Scenario: {scenarios.find((scenario) => scenario.id === activeScenario)?.label ?? "Custom tuning"}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {scenarios.find((scenario) => scenario.id === activeScenario)?.description ?? "You have moved away from a preset and are now exploring a custom parameter mix."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip !normal-case !tracking-normal">
              Active contact {simulation.stimulation.electrodeId.toUpperCase()}
            </span>
            <span className={`status-chip ${simulation.stimulation.enabled ? "ready" : "loading"} !normal-case !tracking-normal`}>
              {simulation.stimulation.enabled ? "Rhythmic stimulation" : "Baseline tremor"}
            </span>
            <span className={`status-chip ${
              analysis.stateLabel === "suppressed" ? "ready" : analysis.stateLabel === "overdriven" ? "error" : "loading"
            } !normal-case !tracking-normal`}>
              {analysis.stateLabel === "suppressed" ? "Suppression window" : analysis.stateLabel === "overdriven" ? "Off-target / overload" : analysis.stateLabel === "therapeutic" ? "Partial therapeutic effect" : "Underpowered"}
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            <MetricRow icon={ShieldAlert} label="Tremor index" value={`${Math.round(metrics.tremorIndex * 100)}%`} />
            <MetricRow icon={RadioTower} label="Network synchrony" value={`${Math.round(metrics.synchrony * 100)}%`} />
            <MetricRow icon={Zap} label="Stimulation dose" value={`${Math.round(metrics.stimulationDose * 100)}%`} />
            <MetricRow icon={Gauge} label="Overload risk" value={`${Math.round(metrics.overloadRisk * 100)}%`} />
            <MetricRow icon={HeartPulse} label="Firing rate" value={`${metrics.firingRate.toFixed(1)} Hz`} />
            <MetricRow icon={Target} label="Suppression score" value={`${Math.round(metrics.suppressionScore * 100)}%`} />
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              What the sandbox is teaching
            </div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {analysis.teachingPoints.map((point) => (
                <p key={point}>{point}</p>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-foreground">Effect pipeline</div>
            <div className="mt-3 grid gap-3">
              <EffectBar label="Recruitment" value={analysis.effectiveness} color="linear-gradient(90deg, #4da2ff, #7ce8ff)" />
              <EffectBar label="Suppression potential" value={analysis.suppressionPotential} color="linear-gradient(90deg, #44d6a8, #8df0c4)" />
              <EffectBar label="Overload drive" value={analysis.overloadDrive} color="linear-gradient(90deg, #ff934d, #ff5b47)" />
            </div>
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
            <SandboxSlider label="Stimulation amplitude" helper="Higher amplitude recruits more of the loop, but too much spills into overload." value={simulation.stimulation.amplitude} min={0.2} max={1.5} step={0.02} display={`${simulation.stimulation.amplitude.toFixed(2)}`} onChange={(value) => updateStimulation({ amplitude: value })} />
            <SandboxSlider label="Frequency" helper="Frequency controls how strongly the model entrains to rhythmic stimulation." value={simulation.stimulation.frequency} min={20} max={185} step={1} display={`${Math.round(simulation.stimulation.frequency)} Hz`} onChange={(value) => updateStimulation({ frequency: value })} />
            <SandboxSlider label="Pulse width" helper="Wider pulses deliver more energy per pulse and can broaden the field." value={simulation.stimulation.pulseWidth} min={30} max={180} step={2} display={`${Math.round(simulation.stimulation.pulseWidth)} μs`} onChange={(value) => updateStimulation({ pulseWidth: value })} />
            <SandboxSlider label="Electrode radius" helper="Radius controls how focal or diffuse the stimulation field is." value={simulation.stimulation.radius} min={0.16} max={0.84} step={0.01} display={`${simulation.stimulation.radius.toFixed(2)}`} onChange={(value) => updateStimulation({ radius: value })} />
            <SandboxSlider label="Noise / tremor severity" helper="This sets how unstable the baseline loop is before stimulation starts to calm it." value={simulation.stimulation.noiseSeverity} min={0.1} max={1} step={0.01} display={`${Math.round(simulation.stimulation.noiseSeverity * 100)}%`} onChange={(value) => updateStimulation({ noiseSeverity: value })} />

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

            <div className="grid gap-2 pt-1">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quick coaching moves</div>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveScenario("custom");
                    setSimulation((current) => ({
                      ...current,
                      stimulation: {
                        ...current.stimulation,
                        amplitude: Math.min(1.5, current.stimulation.amplitude + 0.08),
                        frequency: Math.min(185, current.stimulation.frequency + 10),
                      },
                    }));
                  }}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-left text-foreground transition-colors hover:border-primary/20 hover:bg-primary/10"
                >
                  Recruit more
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveScenario("custom");
                    setSimulation((current) => ({
                      ...current,
                      stimulation: {
                        ...current.stimulation,
                        amplitude: Math.max(0.2, current.stimulation.amplitude - 0.08),
                        pulseWidth: Math.max(30, current.stimulation.pulseWidth - 10),
                        radius: Math.max(0.16, current.stimulation.radius - 0.04),
                      },
                    }));
                  }}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-left text-foreground transition-colors hover:border-primary/20 hover:bg-primary/10"
                >
                  Reduce overload
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveScenario("custom");
                    setSimulation((current) => ({
                      ...current,
                      stimulation: {
                        ...current.stimulation,
                        amplitude: 0.88,
                        frequency: 128,
                        pulseWidth: 96,
                        radius: 0.42,
                      },
                    }));
                  }}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-left text-foreground transition-colors hover:border-primary/20 hover:bg-primary/10"
                >
                  Aim for sweet spot
                </button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <div>
            <p className="eyebrow">Parameter interpretation</p>
            <h3 className="font-display mt-1 text-xl">Why each control matters</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This is an educational model, not a medical planner. It shows the tradeoff between recruitment, rhythmic entrainment, and overload.
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            {analysis.parameterEffects.map((effect) => (
              <div key={effect.label} className="rounded-[1.1rem] border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{effect.label}</span>
                  <span className={`status-chip !min-h-[28px] !px-2 !normal-case !tracking-normal ${
                    effect.status === "good" ? "ready" : effect.status === "high" ? "error" : "loading"
                  }`}>
                    {effect.status === "good" ? "In range" : effect.status === "high" ? "Too high" : "Too low"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{effect.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div>
            <p className="eyebrow">Challenge mode</p>
            <h3 className="font-display mt-1 text-xl">Find the suppressive window</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try to push the loop into a calm state with low overload instead of just maximizing dose.
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            <ChallengeRow
              label="Target 1"
              detail="Get tremor below 38%"
              met={metrics.tremorIndex < 0.38}
            />
            <ChallengeRow
              label="Target 2"
              detail="Keep overload below 35%"
              met={metrics.overloadRisk < 0.35}
            />
            <ChallengeRow
              label="Target 3"
              detail="Reach suppression above 60%"
              met={metrics.suppressionScore > 0.6}
            />
            <div className="rounded-[1.1rem] border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
              {metrics.tremorIndex < 0.38 && metrics.overloadRisk < 0.35 && metrics.suppressionScore > 0.6
                ? "Sweet spot found. This combination is calming the model without overdriving it."
                : "Tune amplitude, frequency, pulse width, and radius until the loop calms without tipping into overload."}
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
  analysis,
  onSelectElectrode,
}: {
  simulation: SimulationState;
  metrics: ReturnType<typeof computeSimulationMetrics>;
  analysis: ReturnType<typeof analyzeStimulation>;
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
        <span className={`status-chip ${analysis.stateLabel === "suppressed" ? "ready" : analysis.stateLabel === "overdriven" ? "error" : "loading"} !normal-case !tracking-normal`}>
          {analysis.stateLabel === "suppressed" ? "Suppressed tremor" : analysis.stateLabel === "overdriven" ? "Overdriven loop" : analysis.stateLabel === "therapeutic" ? "Partial suppression" : "Unstable loop"}
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
              fill={analysis.stateLabel === "suppressed" ? "url(#suppressionGlow)" : "url(#stimGlow)"}
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
          const isSuppressed = analysis.stateLabel === "suppressed" && neuron.id.includes("motor");
          const color = isElectrode
            ? `hsl(${5 - glow * 8} 100% ${63 + glow * 8}%)`
            : isSuppressed
              ? `hsl(${176 + glow * 12} 72% ${56 + glow * 8}%)`
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

function ChallengeRow({
  label,
  detail,
  met,
}: {
  label: string;
  detail: string;
  met: boolean;
}) {
  return (
    <div className="activity-row">
      <Info className={`h-4 w-4 ${met ? "text-emerald-300" : "text-primary"}`} />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
      <span className={`status-chip !min-h-[26px] !px-2 !normal-case !tracking-normal ${met ? "ready" : "loading"}`}>
        {met ? "Met" : "Live"}
      </span>
    </div>
  );
}

function SandboxSlider({
  label,
  helper,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  helper: string;
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
      <p className="text-xs leading-5 text-muted-foreground">{helper}</p>
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

function EffectBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
      </div>
    </div>
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
