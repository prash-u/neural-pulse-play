import { Pause, Play, RotateCcw, Rewind, FastForward } from "lucide-react";

interface Props {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onReset: () => void;
  onSpeedChange: (s: number) => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function PlaybackControls({
  currentTime, duration, isPlaying, speed, onToggle, onSeek, onReset, onSpeedChange,
}: Props) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onReset} className="pill-button pill-button-secondary !min-h-[40px] !px-3" aria-label="Reset">
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onSeek(Math.max(0, currentTime - 2))}
        className="pill-button pill-button-secondary !min-h-[40px] !px-3"
        aria-label="Rewind 2s"
      >
        <Rewind className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="pill-button pill-button-primary !min-h-[44px]"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {isPlaying ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        onClick={() => onSeek(Math.min(duration, currentTime + 2))}
        className="pill-button pill-button-secondary !min-h-[40px] !px-3"
        aria-label="Forward 2s"
      >
        <FastForward className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-[180px] flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full accent-primary"
          aria-label="Seek"
        />
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          {fmt(currentTime)} / {fmt(duration)} ({pct.toFixed(0)}%)
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-full border p-1" style={{ borderColor: "hsl(215 30% 70% / 0.16)", background: "hsl(0 0% 100% / 0.04)" }}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              speed === s ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function fmt(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 100);
  return `${m}:${String(sec).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}
