import { useEffect, useMemo, useState } from "react";
import { Activity, Brain, Download, Gauge, Sparkles, Waves, Zap } from "lucide-react";
import { DBSSandbox } from "@/components/dbs/DBSSandbox";
import { Brain3D } from "@/components/eeg/Brain3D";
import { PlaybackControls } from "@/components/eeg/PlaybackControls";
import { SourcePanel } from "@/components/eeg/SourcePanel";
import { WaveformCanvas } from "@/components/eeg/WaveformCanvas";
import { computeChannelActivities, summarizeActivity } from "@/lib/eeg/activity";
import { DEMO_SAMPLES, generateDemo } from "@/lib/eeg/demo";
import { createReviewRecording, summarizeReviewMetrics, type EEGBandMode, type EEGMontageMode, type EEGReferenceMode } from "@/lib/eeg/review";
import type { EEGRecording } from "@/lib/eeg/types";
import { useEEGPlayback } from "@/lib/eeg/usePlayback";

type WorkspaceMode = "review" | "dbs";

const BAND_OPTIONS: EEGBandMode[] = ["full", "delta", "theta", "alpha", "beta", "gamma"];

const Index = () => {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("review");
  const [recording, setRecording] = useState<EEGRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view3D, setView3D] = useState<"headset" | "brain">("brain");
  const [windowSec, setWindowSec] = useState(10);
  const [signalGain, setSignalGain] = useState(1.15);
  const [heatSpread, setHeatSpread] = useState(1);
  const [surfaceInset, setSurfaceInset] = useState(0.14);
  const [bandMode, setBandMode] = useState<EEGBandMode>("alpha");
  const [referenceMode, setReferenceMode] = useState<EEGReferenceMode>("average");
  const [montageMode, setMontageMode] = useState<EEGMontageMode>("referential");
  const [smoothing, setSmoothing] = useState(0.012);
  const [artifactThreshold, setArtifactThreshold] = useState(85);

  useEffect(() => {
    if (!recording) setRecording(generateDemo(DEMO_SAMPLES[0]));
  }, [recording]);

  const duration = recording?.duration ?? 0;
  const { currentTime, isPlaying, speed, setSpeed, toggle, seek, reset } = useEEGPlayback(duration);

  const reviewResult = useMemo(() => {
    if (!recording) return null;
    return createReviewRecording(recording, {
      band: bandMode,
      reference: referenceMode,
      montage: montageMode,
      smoothing,
      artifactThreshold,
    });
  }, [artifactThreshold, bandMode, montageMode, recording, referenceMode, smoothing]);

  const activeRecording = reviewResult?.recording ?? recording;
  const quality = reviewResult?.quality ?? [];

  const activitySummary = useMemo(() => {
    if (!activeRecording) return null;
    return summarizeActivity(computeChannelActivities(activeRecording, currentTime));
  }, [activeRecording, currentTime]);

  const reviewMetrics = useMemo(() => {
    if (!activeRecording) return null;
    return summarizeReviewMetrics(activeRecording, currentTime, quality);
  }, [activeRecording, currentTime, quality]);

  const handleLoaded = (nextRecording: EEGRecording) => {
    setError(null);
    setRecording(nextRecording);
    reset();
  };

  const exportJSON = () => {
    if (!recording) return;
    const summary = {
      name: recording.name,
      source: recording.source,
      sampleRate: recording.sampleRate,
      duration: recording.duration,
      review: {
        bandMode,
        referenceMode,
        montageMode,
        smoothing,
        artifactThreshold,
      },
      channels: recording.channels.map((channel) => ({
        label: channel.label,
        unit: channel.unit,
        min: channel.min,
        max: channel.max,
      })),
      meta: recording.meta,
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${recording.name.replace(/\.[^.]+$/, "")}-session.json`;
    link.click();
  };

  return (
    <main className="mx-auto w-[min(1480px,calc(100%-32px))] py-6 pb-12">
      <section className="glass-panel relative overflow-hidden grid gap-6 p-7 md:grid-cols-[1.2fr_0.8fr] md:p-8">
        <div className="absolute inset-x-[-8%] bottom-[-38%] h-96 pointer-events-none"
             style={{ background: "radial-gradient(circle, hsl(190 100% 70% / 0.16), transparent 58%)" }} />
        <div className="relative">
          <p className="eyebrow">Neural Pulse Play</p>
          <h1 className="font-display mt-3 text-[clamp(2.5rem,5vw,5rem)] leading-[0.93] max-w-[11ch]">
            DBS + EEG sandbox for review, tuning, and play.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Review EEG with band and montage controls, inspect cortical activity as a topographic field,
            and switch into a basal-ganglia DBS simulation that behaves like a neurostimulation sandbox.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => setWorkspaceMode("review")} className="pill-button pill-button-primary">
              <Waves className="h-4 w-4" /> EEG review
            </button>
            <button type="button" onClick={() => setWorkspaceMode("dbs")} className="pill-button pill-button-secondary">
              <Zap className="h-4 w-4" /> DBS sandbox
            </button>
            <button type="button" onClick={exportJSON} className="pill-button pill-button-secondary" disabled={!recording}>
              <Download className="h-4 w-4" /> Export session
            </button>
          </div>
        </div>

        <aside className="relative grid gap-3 content-end">
          <div className="metric-block">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">Workspace</span>
            <strong className="block mt-1.5 text-lg">{workspaceMode === "review" ? "EEG Review" : "DBS Sandbox"}</strong>
          </div>
          <div className="metric-block">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">Loaded channels</span>
            <strong className="block mt-1.5 text-lg">{recording?.channels.length ?? "—"}</strong>
          </div>
          <div className="metric-block">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">Current band</span>
            <strong className="block mt-1.5 text-lg">{bandMode.toUpperCase()}</strong>
          </div>
        </aside>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        {(["review", "dbs"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setWorkspaceMode(mode)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              workspaceMode === mode ? "bg-primary/15 text-primary border-primary/40" : "text-muted-foreground border-white/10"
            }`}
          >
            {mode === "review" ? "EEG Review" : "DBS Sandbox"}
          </button>
        ))}
      </div>

      {workspaceMode === "review" ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="space-y-5">
            <article className="glass-panel p-6">
              <header className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <p className="eyebrow">Scrolling review</p>
                  <h2 className="font-display text-[clamp(1.6rem,2.5vw,2.2rem)] mt-1">Waveform review pane</h2>
                  {activeRecording && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {activeRecording.name} · {montageMode} montage · {referenceMode} reference
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`status-chip ${activeRecording ? "ready" : "loading"}`}>
                    {activeRecording ? "Review ready" : "Awaiting data"}
                  </span>
                  <div className="flex items-center gap-1 rounded-full border p-1"
                       style={{ borderColor: "hsl(215 30% 70% / 0.16)", background: "hsl(0 0% 100% / 0.04)" }}>
                    {[5, 10, 20].map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={() => setWindowSec(seconds)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                          windowSec === seconds ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {seconds}s
                      </button>
                    ))}
                  </div>
                </div>
              </header>

              <div className="rounded-[1.75rem] overflow-hidden border"
                   style={{ borderColor: "hsl(215 30% 70% / 0.14)", background: "#040816", height: "clamp(280px, 42vh, 480px)" }}>
                {activeRecording ? (
                  <WaveformCanvas recording={activeRecording} currentTime={currentTime} window={windowSec} quality={quality} />
                ) : (
                  <div className="grid h-full place-items-center text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <Waves className="h-5 w-5 text-primary animate-pulse-glow" />
                      <span>Load a recording to begin.</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <PlaybackControls
                  currentTime={currentTime}
                  duration={duration}
                  isPlaying={isPlaying}
                  speed={speed}
                  onToggle={toggle}
                  onSeek={seek}
                  onReset={reset}
                  onSpeedChange={setSpeed}
                />
              </div>
            </article>

            <article className="glass-panel p-6">
              <header className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <p className="eyebrow">Topographic view</p>
                  <h2 className="font-display text-[clamp(1.6rem,2.5vw,2.2rem)] mt-1">
                    {view3D === "headset" ? "Sensor geometry" : "Interpolated cortical map"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Band-limited activity is mapped onto the head or cortex using the active review controls.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView3D((value) => value === "headset" ? "brain" : "headset")}
                  className="pill-button pill-button-secondary !min-h-[40px]"
                >
                  <Brain className="h-4 w-4" />
                  {view3D === "headset" ? "Switch to cortex" : "Switch to headset"}
                </button>
              </header>

              <div className="rounded-[1.75rem] overflow-hidden border"
                   style={{ borderColor: "hsl(215 30% 70% / 0.14)", background: "#040816", height: "clamp(360px, 48vh, 560px)" }}>
                {activeRecording ? (
                  <Brain3D
                    recording={activeRecording}
                    currentTime={currentTime}
                    isPlaying={isPlaying}
                    mode={view3D}
                    signalGain={signalGain}
                    heatSpread={heatSpread}
                    surfaceInset={surfaceInset}
                  />
                ) : (
                  <div className="grid h-full place-items-center text-muted-foreground">
                    <Brain className="h-6 w-6 text-primary" />
                  </div>
                )}
              </div>
            </article>
          </div>

          <aside className="space-y-5">
            <SourcePanel onLoaded={handleLoaded} onError={setError} />

            <ReviewControls
              bandMode={bandMode}
              referenceMode={referenceMode}
              montageMode={montageMode}
              smoothing={smoothing}
              artifactThreshold={artifactThreshold}
              onBandModeChange={setBandMode}
              onReferenceModeChange={setReferenceMode}
              onMontageModeChange={setMontageMode}
              onSmoothingChange={setSmoothing}
              onArtifactThresholdChange={setArtifactThreshold}
            />

            {activeRecording && reviewMetrics && (
              <ReviewMetricsCard
                recording={activeRecording}
                reviewMetrics={reviewMetrics}
                activitySummary={activitySummary}
                isPlaying={isPlaying}
                error={error}
              />
            )}

            {activitySummary && (
              <VisualizationControls
                view3D={view3D}
                signalGain={signalGain}
                heatSpread={heatSpread}
                surfaceInset={surfaceInset}
                onSignalGainChange={setSignalGain}
                onHeatSpreadChange={setHeatSpread}
                onSurfaceInsetChange={setSurfaceInset}
              />
            )}

            {activeRecording && (
              <ChannelQualityCard recording={activeRecording} quality={quality} />
            )}
          </aside>
        </section>
      ) : (
        <div className="mt-5">
          <DBSSandbox />
        </div>
      )}
    </main>
  );
};

function ReviewControls({
  bandMode,
  referenceMode,
  montageMode,
  smoothing,
  artifactThreshold,
  onBandModeChange,
  onReferenceModeChange,
  onMontageModeChange,
  onSmoothingChange,
  onArtifactThresholdChange,
}: {
  bandMode: EEGBandMode;
  referenceMode: EEGReferenceMode;
  montageMode: EEGMontageMode;
  smoothing: number;
  artifactThreshold: number;
  onBandModeChange: (value: EEGBandMode) => void;
  onReferenceModeChange: (value: EEGReferenceMode) => void;
  onMontageModeChange: (value: EEGMontageMode) => void;
  onSmoothingChange: (value: number) => void;
  onArtifactThresholdChange: (value: number) => void;
}) {
  return (
    <div className="glass-panel p-6 space-y-4">
      <div>
        <p className="eyebrow">Review controls</p>
        <h3 className="font-display text-xl mt-1">Band, montage, and artifact pipeline</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Tune the review chain the way you would in a paid EEG tool: choose the band, reference, montage, smoothing, and artifact threshold.
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground">Band mode</span>
        <div className="flex flex-wrap gap-2">
          {BAND_OPTIONS.map((band) => (
            <button
              key={band}
              type="button"
              onClick={() => onBandModeChange(band)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase transition-colors ${
                bandMode === band ? "bg-primary/15 text-primary border-primary/40" : "text-muted-foreground border-white/10"
              }`}
            >
              {band}
            </button>
          ))}
        </div>
      </div>

      <ToggleRow
        label="Reference"
        options={[
          { value: "raw", label: "Raw" },
          { value: "average", label: "Average" },
        ]}
        currentValue={referenceMode}
        onChange={(value) => onReferenceModeChange(value as EEGReferenceMode)}
      />

      <ToggleRow
        label="Montage"
        options={[
          { value: "referential", label: "Referential" },
          { value: "bipolar", label: "Bipolar" },
        ]}
        currentValue={montageMode}
        onChange={(value) => onMontageModeChange(value as EEGMontageMode)}
      />

      <SliderRow
        label="Signal smoothing"
        value={smoothing}
        min={0}
        max={0.04}
        step={0.002}
        display={`${Math.round(smoothing * 1000)} ms`}
        onChange={onSmoothingChange}
      />

      <SliderRow
        label="Artifact threshold"
        value={artifactThreshold}
        min={45}
        max={160}
        step={1}
        display={`${Math.round(artifactThreshold)} µV`}
        onChange={onArtifactThresholdChange}
      />
    </div>
  );
}

function ReviewMetricsCard({
  recording,
  reviewMetrics,
  activitySummary,
  isPlaying,
  error,
}: {
  recording: EEGRecording;
  reviewMetrics: ReturnType<typeof summarizeReviewMetrics>;
  activitySummary: ReturnType<typeof summarizeActivity> | null;
  isPlaying: boolean;
  error: string | null;
}) {
  return (
    <div className="glass-panel p-6 space-y-4">
      <div>
        <p className="eyebrow">Review metrics</p>
        <h3 className="font-display text-xl mt-1">Session quality and synchrony</h3>
        <p className="text-sm text-muted-foreground mt-1">
          A compact clinical HUD for the active playback frame.
        </p>
      </div>

      {error && <div className="status-chip error w-full justify-start !min-h-[40px]">{error}</div>}

      <div className="grid gap-3">
        <MetricRow icon={Gauge} label="Synchrony" value={`${Math.round(reviewMetrics.synchrony * 100)}%`} />
        <MetricRow icon={Sparkles} label="Network entropy" value={`${Math.round(reviewMetrics.entropy * 100)}%`} />
        <MetricRow icon={Activity} label="Artifacted channels" value={`${reviewMetrics.artifactCount} / ${recording.channels.length}`} />
        <MetricRow icon={Waves} label="Dominant band" value={reviewMetrics.dominantBand.toUpperCase()} />
        <MetricRow icon={Zap} label="Global activity" value={activitySummary ? `${Math.round(activitySummary.globalActivity * 100)}%` : "—"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`status-chip ${isPlaying ? "ready" : "loading"} !normal-case !tracking-normal`}>
          {isPlaying ? "Live playback" : "Paused frame"}
        </span>
        <span className="status-chip !normal-case !tracking-normal">{recording.sampleRate.toFixed(0)} Hz review stream</span>
      </div>
    </div>
  );
}

function ChannelQualityCard({
  recording,
  quality,
}: {
  recording: EEGRecording;
  quality: ReturnType<typeof createReviewRecording>["quality"];
}) {
  const qualityByLabel = new Map(quality.map((channel) => [channel.label, channel]));

  return (
    <div className="glass-panel p-6 space-y-3">
      <p className="eyebrow">Channel quality</p>
      <h3 className="font-display text-xl">Resolved channels</h3>
      <div className="flex flex-wrap gap-1.5">
        {recording.channels.map((channel) => (
          <span
            key={channel.label}
            className={`status-chip !min-h-[26px] !text-[10px] !px-2 ${
              qualityByLabel.get(channel.label)?.artifact ? "loading" : "ready"
            }`}
          >
            {cleanLabel(channel.label)} {Math.round((qualityByLabel.get(channel.label)?.quality ?? 0) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function VisualizationControls({
  view3D,
  signalGain,
  heatSpread,
  surfaceInset,
  onSignalGainChange,
  onHeatSpreadChange,
  onSurfaceInsetChange,
}: {
  view3D: "headset" | "brain";
  signalGain: number;
  heatSpread: number;
  surfaceInset: number;
  onSignalGainChange: (value: number) => void;
  onHeatSpreadChange: (value: number) => void;
  onSurfaceInsetChange: (value: number) => void;
}) {
  return (
    <div className="glass-panel p-6 space-y-4">
      <div>
        <p className="eyebrow">Visualization controls</p>
        <h3 className="font-display text-xl mt-1">Topography tuning</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Tune cortical gain, spatial spread, and electrode inset for a tighter professional presentation.
        </p>
      </div>

      <SliderRow
        label="Signal gain"
        value={signalGain}
        min={0.75}
        max={1.8}
        step={0.05}
        display={`${signalGain.toFixed(2)}×`}
        onChange={onSignalGainChange}
      />

      <SliderRow
        label="Map spread"
        value={heatSpread}
        min={0.65}
        max={1.6}
        step={0.05}
        display={`${heatSpread.toFixed(2)}×`}
        onChange={onHeatSpreadChange}
      />

      <SliderRow
        label={view3D === "brain" ? "Cortical inset" : "Headset inset"}
        value={surfaceInset}
        min={0.04}
        max={0.24}
        step={0.01}
        display={`${Math.round(surfaceInset * 100)}%`}
        onChange={onSurfaceInsetChange}
      />
    </div>
  );
}

function ToggleRow({
  label,
  options,
  currentValue,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  currentValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors ${
              currentValue === option.value ? "bg-primary/15 text-primary border-primary/40" : "text-muted-foreground border-white/10"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SliderRow({
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
        <span className="text-sm font-semibold text-foreground">{label}</span>
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
  icon: typeof Gauge;
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

function cleanLabel(label: string) {
  return label.replace(/-REF|EEG /gi, "").slice(0, 9);
}

export default Index;
