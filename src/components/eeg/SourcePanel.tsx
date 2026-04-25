import { useRef, useState } from "react";
import { Link2, Loader2, Sparkles, Upload } from "lucide-react";
import { DEMO_SAMPLES, generateDemo } from "@/lib/eeg/demo";
import { loadFromFile, loadFromUrl } from "@/lib/eeg/load";
import type { EEGRecording } from "@/lib/eeg/types";

interface Props {
  onLoaded: (rec: EEGRecording) => void;
  onError: (msg: string) => void;
}

export function SourcePanel({ onLoaded, onError }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    try {
      setBusy("Parsing file…");
      const recording = await loadFromFile(file);
      onLoaded(recording);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to parse file");
    } finally {
      setBusy(null);
    }
  };

  const handleUrl = async () => {
    if (!url.trim()) return;
    try {
      setBusy("Fetching remote file…");
      const recording = await loadFromUrl(url.trim());
      onLoaded(recording);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to fetch URL");
    } finally {
      setBusy(null);
    }
  };

  const handleDemo = (id: string) => {
    const spec = DEMO_SAMPLES.find((demo) => demo.id === id);
    if (!spec) return;

    setBusy("Generating demo…");
    setTimeout(() => {
      try {
        onLoaded(generateDemo(spec));
      } catch (error) {
        onError(error instanceof Error ? error.message : "Failed to generate demo");
      } finally {
        setBusy(null);
      }
    }, 0);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Signal source</p>
        <h2 className="font-display text-xl mt-1">Upload, then review</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Use local upload first for reliability. Built-in demos are instant, and URL loading stays available as an advanced fallback.
        </p>
      </div>

      <div className="space-y-2">
        <p className="eyebrow text-[0.65rem]">Recommended</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.txt,.edf,.bdf,.tsv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          className="pill-button pill-button-primary w-full disabled:opacity-60"
        >
          <Upload className="h-4 w-4" /> Upload EEG file
        </button>
        <p className="text-[11px] text-muted-foreground">
          Best starting formats: `.csv`, `.json`, `.txt`. EDF/BDF support can still be used later.
        </p>
      </div>

      <div className="space-y-2">
        <p className="eyebrow text-[0.65rem]">Built-in demos</p>
        <div className="grid grid-cols-1 gap-2">
          {DEMO_SAMPLES.map((demo) => (
            <button
              key={demo.id}
              type="button"
              onClick={() => handleDemo(demo.id)}
              disabled={!!busy}
              className="group text-left rounded-3xl border p-4 transition-colors hover:border-primary/40 disabled:opacity-60"
              style={{ background: "hsl(0 0% 100% / 0.03)", borderColor: "hsl(215 30% 78% / 0.12)" }}
            >
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-semibold text-foreground">{demo.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{demo.description}</p>
            </button>
          ))}
        </div>
      </div>

      <details className="rounded-3xl border p-4" style={{ borderColor: "hsl(215 30% 78% / 0.12)", background: "hsl(0 0% 100% / 0.02)" }}>
        <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
          <span>
            <p className="eyebrow text-[0.65rem]">Advanced</p>
            <span className="text-sm font-semibold text-foreground">Load from URL</span>
          </span>
          <Link2 className="h-4 w-4 text-primary" />
        </summary>
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…/recording.edf"
              className="flex-1 rounded-full px-4 py-2 text-sm outline-none border focus:border-primary"
              style={{ background: "hsl(0 0% 100% / 0.04)", borderColor: "hsl(215 30% 70% / 0.16)", color: "hsl(var(--foreground))" }}
            />
            <button
              type="button"
              onClick={handleUrl}
              disabled={!!busy || !url.trim()}
              className="pill-button pill-button-secondary disabled:opacity-60"
              aria-label="Fetch URL"
            >
              <Link2 className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            External sources can fail because of CORS, huge downloads, unstable hosting, or inconsistent file formats.
          </p>
        </div>
      </details>

      {busy && (
        <div className="flex items-center gap-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" /> {busy}
        </div>
      )}
    </div>
  );
}
