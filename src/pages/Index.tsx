import { useEffect, useMemo, useState } from "react";
import { Activity, Brain, Waves, Download, ArrowLeftRight } from "lucide-react";
import { SourcePanel } from "@/components/eeg/SourcePanel";
import { WaveformCanvas } from "@/components/eeg/WaveformCanvas";
import { Brain3D } from "@/components/eeg/Brain3D";
import { PlaybackControls } from "@/components/eeg/PlaybackControls";
import { computeChannelActivities, summarizeActivity } from "@/lib/eeg/activity";
import { useEEGPlayback } from "@/lib/eeg/usePlayback";
import { DEMO_SAMPLES, generateDemo } from "@/lib/eeg/demo";
import type { EEGRecording } from "@/lib/eeg/types";

const Index = () => {
  const [recording, setRecording] = useState<EEGRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view3D, setView3D] = useState<"headset" | "brain">("headset");
  const [windowSec, setWindowSec] = useState(10);

  // Auto-load a demo on first mount so the app never feels empty.
  useEffect(() => {
    if (!recording) setRecording(generateDemo(DEMO_SAMPLES[0]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const duration = recording?.duration ?? 0;
  const { currentTime, isPlaying, speed, setSpeed, toggle, seek, reset } = useEEGPlayback(duration);
  const activitySummary = useMemo(() => {
    if (!recording) return null;
    return summarizeActivity(computeChannelActivities(recording, currentTime));
  }, [recording, currentTime]);

  const handleLoaded = (rec: EEGRecording) => {
    setError(null);
    setRecording(rec);
    reset();
  };

  const exportJSON = () => {
    if (!recording) return;
    const summary = {
      name: recording.name,
      source: recording.source,
      sampleRate: recording.sampleRate,
      duration: recording.duration,
      channels: recording.channels.map((c) => ({ label: c.label, unit: c.unit, min: c.min, max: c.max })),
      meta: recording.meta,
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${recording.name.replace(/\.[^.]+$/, "")}-summary.json`;
    a.click();
  };

  return (
    <main className="mx-auto w-[min(1380px,calc(100%-32px))] py-6 pb-12">
      {/* Hero */}
      <section className="glass-panel relative overflow-hidden grid md:grid-cols-[1.25fr_0.75fr] gap-5 p-7 md:p-8 mb-5">
        <div className="absolute -right-[10%] bottom-[-35%] h-80 w-[120%] pointer-events-none"
             style={{ background: "radial-gradient(circle, hsl(200 100% 67% / 0.2), transparent 62%)" }} />
        <div className="relative">
          <p className="eyebrow">EEG Stream Visualizer</p>
          <h1 className="font-display mt-3 text-[clamp(2.4rem,5vw,4.8rem)] leading-[0.95] max-w-[10ch]">
            See the signal inside your mind.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Load EEG from a file, a URL, or a bundled demo — then play, pause, and scrub the recording
            like a video while every channel comes alive on a 3D head model.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#workspace" className="pill-button pill-button-primary">
              <Activity className="h-4 w-4" /> Open workspace
            </a>
            <button type="button" onClick={exportJSON} className="pill-button pill-button-secondary" disabled={!recording}>
              <Download className="h-4 w-4" /> Export metadata
            </button>
          </div>
        </div>
        <aside className="relative grid content-end gap-3">
          <div className="metric-block">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">Channels</span>
            <strong className="block mt-1.5 text-lg">{recording?.channels.length ?? "—"}</strong>
          </div>
          <div className="metric-block">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">Sample rate</span>
            <strong className="block mt-1.5 text-lg">
              {recording ? `${recording.sampleRate.toFixed(0)} Hz` : "—"}
            </strong>
          </div>
          <div className="metric-block">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">Duration</span>
            <strong className="block mt-1.5 text-lg">
              {recording ? `${recording.duration.toFixed(1)}s` : "—"}
            </strong>
          </div>
        </aside>
      </section>

      {/* Workspace */}
      <section id="workspace" className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        {/* Left: waveforms + 3D stacked */}
        <div className="space-y-5">
          <article className="glass-panel p-6">
            <header className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <p className="eyebrow">Scrolling window</p>
                <h2 className="font-display text-[clamp(1.6rem,2.5vw,2.2rem)] mt-1">Channel waveforms</h2>
                {recording && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {recording.name} · <span className="text-primary">{recording.source}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`status-chip ${recording ? "ready" : "loading"}`}>
                  {recording ? "Ready" : "Awaiting data"}
                </span>
                <div className="flex items-center gap-1 rounded-full border p-1"
                     style={{ borderColor: "hsl(215 30% 70% / 0.16)", background: "hsl(0 0% 100% / 0.04)" }}>
                  {[5, 10, 20].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWindowSec(w)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                        windowSec === w ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {w}s
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <div className="rounded-[1.75rem] overflow-hidden border"
                 style={{ borderColor: "hsl(215 30% 70% / 0.14)", background: "#040816", height: "clamp(280px, 42vh, 480px)" }}>
              {recording ? (
                <WaveformCanvas recording={recording} currentTime={currentTime} window={windowSec} />
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
                <p className="eyebrow">3D visualization</p>
                <h2 className="font-display text-[clamp(1.6rem,2.5vw,2.2rem)] mt-1">
                  {view3D === "headset" ? "EEG Headset (10-20)" : "Cortex view"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Electrodes pulse with live per-channel amplitude. Drag to orbit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView3D(view3D === "headset" ? "brain" : "headset")}
                className="pill-button pill-button-secondary !min-h-[40px]"
              >
                <ArrowLeftRight className="h-4 w-4" />
                {view3D === "headset" ? "Switch to brain" : "Switch to headset"}
              </button>
            </header>

            <div className="rounded-[1.75rem] overflow-hidden border"
                 style={{ borderColor: "hsl(215 30% 70% / 0.14)", background: "#040816", height: "clamp(360px, 48vh, 560px)" }}>
              {recording ? (
                <Brain3D recording={recording} currentTime={currentTime} isPlaying={isPlaying} mode={view3D} />
              ) : (
                <div className="grid h-full place-items-center text-muted-foreground">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
              )}
            </div>
          </article>
        </div>

        {/* Right: source + inspector */}
        <aside className="space-y-5">
          <SourcePanel onLoaded={handleLoaded} onError={setError} />

          <div className="glass-panel p-6 space-y-3">
            <p className="eyebrow">Inspector</p>
            <h3 className="font-display text-xl">Recording details</h3>
            {error && (
              <div className="status-chip error w-full justify-start !min-h-[40px]">
                {error}
              </div>
            )}
            {recording ? (
              <dl className="grid gap-3 mt-2">
                <Detail label="Name" value={recording.name} />
                <Detail label="Source" value={recording.source} />
                <Detail label="Channels" value={String(recording.channels.length)} />
                <Detail label="Sample rate" value={`${recording.sampleRate.toFixed(1)} Hz`} />
                <Detail label="Duration" value={`${recording.duration.toFixed(2)} s`} />
                {Object.entries(recording.meta).slice(0, 4).map(([k, v]) => (
                  v ? <Detail key={k} label={k} value={v} /> : null
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No recording loaded yet.</p>
            )}
          </div>

          {activitySummary && <LiveActivityInspector summary={activitySummary} isPlaying={isPlaying} />}

          {recording && (
            <div className="glass-panel p-6 space-y-3">
              <p className="eyebrow">Channels</p>
              <div className="flex flex-wrap gap-1.5">
                {recording.channels.map((c) => (
                  <span key={c.label} className="status-chip !min-h-[26px] !text-[10px] !px-2">
                    {c.label.replace(/-REF|EEG /gi, "").slice(0, 6)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
};

function LiveActivityInspector({
  summary,
  isPlaying,
}: {
  summary: ReturnType<typeof summarizeActivity>;
  isPlaying: boolean;
}) {
  const dominant = summary.topChannels[0];

  return (
    <div className="glass-panel p-6 space-y-4">
      <div>
        <p className="eyebrow">Live activity</p>
        <h3 className="font-display text-xl mt-1">Signal-to-brain driver</h3>
        <p className="text-sm text-muted-foreground mt-1">
          These values use the same activity model that powers the 3D electrode glow.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`status-chip ${isPlaying ? "ready" : "loading"} !normal-case !tracking-normal`}>
          {isPlaying ? "Live playback" : "Paused frame"}
        </span>
        <span className="status-chip !normal-case !tracking-normal">Blue to red = low to high activity</span>
      </div>

      <div className="metric-block !p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">Global glow</span>
            <strong className="block mt-1.5 text-2xl">{Math.round(summary.globalActivity * 100)}%</strong>
          </div>
          {dominant && (
            <span className="status-chip ready !normal-case !tracking-normal">
              Peak: {cleanLabel(dominant.label)} {Math.round(dominant.activity * 100)}%
            </span>
          )}
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="activity-meter-fill"
            style={{ width: `${Math.round(summary.globalActivity * 100)}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {summary.topChannels.map((channel) => (
          <div key={channel.channelIdx} className="activity-row">
            <span className="w-12 text-xs font-bold text-foreground">{cleanLabel(channel.label)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="activity-channel-fill"
                style={{ width: `${Math.round(channel.activity * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs font-mono text-muted-foreground">
              {Math.round(channel.activity * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground break-words">{value}</dd>
    </div>
  );
}

function cleanLabel(label: string) {
  return label.replace(/-REF|EEG /gi, "").slice(0, 6);
}

export default Index;
