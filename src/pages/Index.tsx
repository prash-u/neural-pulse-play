import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Brain, Download, Gauge, Sparkles, Waves, Zap } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DBSSandbox } from "@/components/dbs/DBSSandbox";
import { Brain3D } from "@/components/eeg/Brain3D";
import { PlaybackControls } from "@/components/eeg/PlaybackControls";
import { SourcePanel } from "@/components/eeg/SourcePanel";
import { WaveformCanvas } from "@/components/eeg/WaveformCanvas";
import { AppShell, MainWorkspace, Panel, StickyControlRail } from "@/components/layout/WorkspaceShell";
import { computeChannelActivities, summarizeActivity } from "@/lib/eeg/activity";
import { DEMO_SAMPLES, generateDemo } from "@/lib/eeg/demo";
import {
  createReviewRecording,
  summarizeReviewMetrics,
  type EEGBandMode,
  type EEGMontageMode,
  type EEGReferenceMode,
} from "@/lib/eeg/review";
import type { EEGRecording } from "@/lib/eeg/types";
import { useEEGPlayback } from "@/lib/eeg/usePlayback";

type WorkspaceMode = "review" | "dbs";
type MapMode = "headmap" | "cortical";

const BAND_OPTIONS: EEGBandMode[] = ["delta", "theta", "alpha", "beta", "gamma", "full"];

const Index = () => {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("review");
  const [recording, setRecording] = useState<EEGRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("headmap");
  const [showLabels, setShowLabels] = useState(false);
  const [windowSec, setWindowSec] = useState(10);
  const [signalGain, setSignalGain] = useState(1.15);
  const [heatSpread, setHeatSpread] = useState(1);
  const [surfaceInset, setSurfaceInset] = useState(0.14);
  const [bandMode, setBandMode] = useState<EEGBandMode>("alpha");
  const [referenceMode, setReferenceMode] = useState<EEGReferenceMode>("average");
  const [montageMode, setMontageMode] = useState<EEGMontageMode>("referential");
  const [smoothing, setSmoothing] = useState(0.012);
  const [artifactThreshold, setArtifactThreshold] = useState(85);
  const [openSections, setOpenSections] = useState<string[]>(["review-controls", "review-metrics"]);

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

  useEffect(() => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (activeRecording) next.delete("signal-source");
      else next.add("signal-source");

      const hasArtifacts = (reviewMetrics?.artifactCount ?? 0) > 0;
      if (hasArtifacts) next.add("channel-quality");
      else next.delete("channel-quality");

      return Array.from(next);
    });
  }, [activeRecording, reviewMetrics?.artifactCount]);

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
        signalGain,
        heatSpread,
        surfaceInset,
        mapMode,
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

  const sectionSummary = {
    source: recording ? `${recording.name} • ${recording.channels.length} ch` : "Upload or load a demo",
    controls: `${bandMode.toUpperCase()} • ${referenceMode} ref • ${montageMode}`,
    metrics: reviewMetrics
      ? `Sync ${Math.round(reviewMetrics.synchrony * 100)}% • Artifacts ${reviewMetrics.artifactCount}`
      : "Awaiting review metrics",
    visual: `${mapMode === "headmap" ? "Head map" : "Cortical"} • Gain ${signalGain.toFixed(2)}× • Labels ${showLabels ? "on" : "hover"}`,
    quality:
      quality.length > 0
        ? `${quality.filter((channel) => channel.artifact).length} flagged • ${quality.length} tracked`
        : "No channels resolved yet",
  };

  return (
    <main className="mx-auto w-[min(1480px,calc(100%-28px))] py-5 pb-10">
      <Panel className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Neural Pulse Play</p>
            <h1 className="font-display mt-1 text-[clamp(1.8rem,3vw,2.65rem)]">DBS + EEG Sandbox</h1>
            <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
              Review uploaded EEG with a readable head map, then switch into an educational DBS loop without losing the workspace.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="status-chip !normal-case !tracking-normal">Workspace {workspaceMode === "review" ? "EEG Review" : "DBS Sandbox"}</span>
            <span className="status-chip !normal-case !tracking-normal">Loaded channels {recording?.channels.length ?? "—"}</span>
            <span className="status-chip !normal-case !tracking-normal">Current band {bandMode.toUpperCase()}</span>
          </div>
        </div>
      </Panel>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["review", "dbs"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setWorkspaceMode(mode)}
              className={workspaceMode === mode ? "pill-button pill-button-primary !min-h-[40px]" : "pill-button pill-button-secondary !min-h-[40px]"}
            >
              {mode === "review" ? <Waves className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
              {mode === "review" ? "EEG Review" : "DBS Sandbox"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportJSON} className="pill-button pill-button-secondary !min-h-[40px]" disabled={!recording}>
            <Download className="h-4 w-4" />
            Export session
          </button>
        </div>
      </div>

      {workspaceMode === "review" ? (
        <AppShell className="mt-4">
          <MainWorkspace>
            <Panel className="p-5 md:p-6">
              <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Waveform review</p>
                  <h2 className="font-display mt-1 text-[clamp(1.35rem,2vw,1.85rem)]">Clinical waveform browser</h2>
                  {activeRecording ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activeRecording.name} • {montageMode} montage • {referenceMode} reference • smoothing {Math.round(smoothing * 1000)} ms
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">Load or upload a session to begin review.</p>
                  )}
                </div>

                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
                  {[5, 10, 20].map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setWindowSec(seconds)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        windowSec === seconds ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
              </header>

              <ProcessingSummaryStrip
                recording={activeRecording}
                bandMode={bandMode}
                referenceMode={referenceMode}
                montageMode={montageMode}
                smoothing={smoothing}
                artifactCount={reviewMetrics?.artifactCount ?? 0}
              />

              <div
                className="mt-4 overflow-hidden rounded-[1.6rem] border"
                style={{ borderColor: "hsl(215 30% 70% / 0.14)", background: "#040816", height: "clamp(250px, 34vh, 340px)" }}
              >
                {activeRecording ? (
                  <WaveformCanvas
                    recording={activeRecording}
                    currentTime={currentTime}
                    window={windowSec}
                    gain={signalGain}
                    quality={quality}
                  />
                ) : (
                  <EmptyState icon={Waves} label="Load a recording to begin waveform review." />
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
            </Panel>

            <Panel className="p-5 md:p-6">
              <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Topographic view</p>
                  <h2 className="font-display mt-1 text-[clamp(1.35rem,2vw,1.85rem)]">
                    {mapMode === "headmap" ? "Top-down EEG head map" : "Cortical surface map"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mapMode === "headmap"
                      ? "Activity is interpolated from standard 10-20 positions and colored by the active band review settings."
                      : "Orbital cortical inspection with fixed anatomical viewpoints and activity flowing across the surface field."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(["headmap", "cortical"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMapMode(mode)}
                      className={mapMode === mode ? "pill-button pill-button-primary !min-h-[40px]" : "pill-button pill-button-secondary !min-h-[40px]"}
                    >
                      <Brain className="h-4 w-4" />
                      {mode === "headmap" ? "Head map" : "Cortical surface"}
                    </button>
                  ))}
                </div>
              </header>

              <div
                className="overflow-hidden rounded-[1.6rem] border"
                style={{ borderColor: "hsl(215 30% 70% / 0.14)", background: "#040816", height: "clamp(320px, 40vh, 430px)" }}
              >
                {activeRecording ? (
                  <Brain3D
                    recording={activeRecording}
                    currentTime={currentTime}
                    isPlaying={isPlaying}
                    mode={mapMode}
                    bandMode={bandMode}
                    signalGain={signalGain}
                    heatSpread={heatSpread}
                    surfaceInset={surfaceInset}
                    quality={quality}
                    showLabels={showLabels}
                  />
                ) : (
                  <EmptyState icon={Brain} label="Load a recording to view the cortical map." />
                )}
              </div>
            </Panel>
          </MainWorkspace>

          <StickyControlRail>
            <Panel className="p-0 overflow-hidden">
              <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="w-full">
                <RailSection
                  value="signal-source"
                  title="Signal Source"
                  summary={sectionSummary.source}
                >
                  <SourcePanel onLoaded={handleLoaded} onError={setError} />
                </RailSection>

                <RailSection
                  value="review-controls"
                  title="Processing"
                  summary={sectionSummary.controls}
                >
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
                </RailSection>

                <RailSection
                  value="review-metrics"
                  title="Session State"
                  summary={sectionSummary.metrics}
                >
                  <ReviewMetricsCard
                    recording={activeRecording}
                    reviewMetrics={reviewMetrics}
                    activitySummary={activitySummary}
                    isPlaying={isPlaying}
                    error={error}
                  />
                </RailSection>

                <RailSection
                  value="visualisation-controls"
                  title="Display"
                  summary={sectionSummary.visual}
                >
                  <VisualizationControls
                    showLabels={showLabels}
                    signalGain={signalGain}
                    heatSpread={heatSpread}
                    surfaceInset={surfaceInset}
                    onShowLabelsChange={setShowLabels}
                    onSignalGainChange={setSignalGain}
                    onHeatSpreadChange={setHeatSpread}
                    onSurfaceInsetChange={setSurfaceInset}
                  />
                </RailSection>

                <RailSection
                  value="channel-quality"
                  title="Channel QA"
                  summary={sectionSummary.quality}
                >
                  <ChannelQualityCard recording={activeRecording} quality={quality} />
                </RailSection>
              </Accordion>
            </Panel>
          </StickyControlRail>
        </AppShell>
      ) : (
        <div className="mt-4">
          <DBSSandbox />
        </div>
      )}
    </main>
  );
};

function RailSection({
  value,
  title,
  summary,
  children,
}: {
  value: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border-white/10 px-6">
      <AccordionTrigger className="py-5 hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="truncate text-xs text-muted-foreground">{summary}</div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-5">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function ProcessingSummaryStrip({
  recording,
  bandMode,
  referenceMode,
  montageMode,
  smoothing,
  artifactCount,
}: {
  recording: EEGRecording | null;
  bandMode: EEGBandMode;
  referenceMode: EEGReferenceMode;
  montageMode: EEGMontageMode;
  smoothing: number;
  artifactCount: number;
}) {
  const items = [
    { label: "Dataset", value: recording?.name ?? "No recording" },
    { label: "Band", value: bandMode.toUpperCase() },
    { label: "Reference", value: referenceMode === "average" ? "Average" : "Raw" },
    { label: "Montage", value: montageMode === "referential" ? "Referential" : "Bipolar" },
    { label: "Smoothing", value: `${Math.round(smoothing * 1000)} ms` },
    { label: "Artifacts", value: `${artifactCount}` },
  ];

  return (
    <div className="grid gap-2 rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="rounded-[1rem] border border-white/8 bg-[#07101d] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{item.label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

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
    <div className="space-y-4">
      <div className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-muted-foreground">
        Processing order: reference and montage reshape the traces first, then smoothing and artifact screening clean the review frame.
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
                bandMode === band ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground"
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
        display={`${Math.round(artifactThreshold)} μV`}
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
  recording: EEGRecording | null;
  reviewMetrics: ReturnType<typeof summarizeReviewMetrics> | null;
  activitySummary: ReturnType<typeof summarizeActivity> | null;
  isPlaying: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      {error ? <div className="status-chip error w-full justify-start !normal-case !tracking-normal">{error}</div> : null}

      <div className="grid gap-3">
        <MetricRow icon={Gauge} label="Synchrony" value={reviewMetrics ? `${Math.round(reviewMetrics.synchrony * 100)}%` : "—"} />
        <MetricRow icon={Sparkles} label="Network entropy" value={reviewMetrics ? `${Math.round(reviewMetrics.entropy * 100)}%` : "—"} />
        <MetricRow icon={Activity} label="Artifacted channels" value={reviewMetrics && recording ? `${reviewMetrics.artifactCount} / ${recording.channels.length}` : "—"} />
        <MetricRow icon={Waves} label="Dominant band" value={reviewMetrics ? reviewMetrics.dominantBand.toUpperCase() : "—"} />
        <MetricRow icon={Zap} label="Global activity" value={activitySummary ? `${Math.round(activitySummary.globalActivity * 100)}%` : "—"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`status-chip ${isPlaying ? "ready" : "loading"} !normal-case !tracking-normal`}>
          {isPlaying ? "Live playback" : "Paused frame"}
        </span>
        {recording ? (
          <span className="status-chip !normal-case !tracking-normal">{recording.sampleRate.toFixed(0)} Hz review stream</span>
        ) : null}
      </div>
    </div>
  );
}

function VisualizationControls({
  showLabels,
  signalGain,
  heatSpread,
  surfaceInset,
  onShowLabelsChange,
  onSignalGainChange,
  onHeatSpreadChange,
  onSurfaceInsetChange,
}: {
  showLabels: boolean;
  signalGain: number;
  heatSpread: number;
  surfaceInset: number;
  onShowLabelsChange: (value: boolean) => void;
  onSignalGainChange: (value: number) => void;
  onHeatSpreadChange: (value: number) => void;
  onSurfaceInsetChange: (value: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-muted-foreground">
        Display tuning affects the waveform gain, head-map spread, and how deeply cortical contacts sit in the 3D surface.
      </div>

      <ToggleRow
        label="Electrode labels"
        options={[
          { value: "off", label: "Hover only" },
          { value: "on", label: "Always show" },
        ]}
        currentValue={showLabels ? "on" : "off"}
        onChange={(value) => onShowLabelsChange(value === "on")}
      />

      <SliderRow
        label="Signal gain"
        value={signalGain}
        min={0.8}
        max={1.95}
        step={0.05}
        display={`${signalGain.toFixed(2)}×`}
        onChange={onSignalGainChange}
      />

      <SliderRow
        label="Map spread"
        value={heatSpread}
        min={0.65}
        max={1.65}
        step={0.05}
        display={`${heatSpread.toFixed(2)}×`}
        onChange={onHeatSpreadChange}
      />

      <SliderRow
        label="Cortical inset"
        value={surfaceInset}
        min={0.04}
        max={0.28}
        step={0.01}
        display={`${Math.round(surfaceInset * 100)}%`}
        onChange={onSurfaceInsetChange}
      />
    </div>
  );
}

function ChannelQualityCard({
  recording,
  quality,
}: {
  recording: EEGRecording | null;
  quality: ReturnType<typeof createReviewRecording>["quality"];
}) {
  if (!recording) {
    return <div className="text-sm text-muted-foreground">Load a recording to inspect per-channel quality.</div>;
  }

  const qualityByLabel = new Map(quality.map((channel) => [channel.label, channel]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {recording.channels.map((channel) => (
          <span
            key={channel.label}
            className={`status-chip !min-h-[28px] !px-2 !text-[10px] ${
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
              currentValue === option.value ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground"
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
    <label className="block space-y-2">
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

function EmptyState({
  icon: Icon,
  label,
}: {
  icon: typeof Brain;
  label: string;
}) {
  return (
    <div className="grid h-full place-items-center text-muted-foreground">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function cleanLabel(label: string) {
  return label.replace(/-REF|EEG /gi, "").slice(0, 9);
}

export default Index;
