import { useRef, useState } from "react";
import { Upload, Link2, Sparkles, Loader2 } from "lucide-react";
import type { EEGRecording } from "@/lib/eeg/types";
import { loadFromFile, loadFromUrl } from "@/lib/eeg/load";
import { DEMO_SAMPLES, generateDemo } from "@/lib/eeg/demo";

interface Props {
  onLoaded: (rec: EEGRecording) => void;
  onError: (msg: string) => void;
}

export function SourcePanel({ onLoaded, onError }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    try {
      setBusy("Parsing file…");
      const rec = await loadFromFile(f);
      onLoaded(rec);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to parse file");
    } finally { setBusy(null); }
  };

  const handleUrl = async () => {
    if (!url.trim()) return;
    try {
      setBusy("Fetching remote file…");
      const rec = await loadFromUrl(url.trim());
      onLoaded(rec);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to fetch URL");
    } finally { setBusy(null); }
  };

  const handleDemo = (id: string) => {
    const spec = DEMO_SAMPLES.find((d) => d.id === id);
    if (!spec) return;
    setBusy("Generating demo…");
    // Let UI paint the busy state
    setTimeout(() => {
      try {
        const rec = generateDemo(spec);
        onLoaded(rec);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Failed to generate demo");
      } finally { setBusy(null); }
    }, 0);
  };

  return (
    <div className="glass-panel p-6 space-y-5">
      <div>
        <p className="eyebrow">Signal source</p>
        <h2 className="font-display text-2xl mt-1">Load a recording</h2>
        <p className="text-sm text-muted-foreground mt-1">
          EDF/BDF, CSV or TSV — from your device, a URL, or a bundled demo.
        </p>
      </div>

      {/* Demos */}
      <div className="space-y-2">
        <p className="eyebrow text-[0.65rem]">Demos</p>
        <div className="grid grid-cols-1 gap-2">
          {DEMO_SAMPLES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => handleDemo(d.id)}
              disabled={!!busy}
              className="group text-left rounded-3xl border p-4 transition-colors hover:border-primary/40 disabled:opacity-60"
              style={{ background: "hsl(0 0% 100% / 0.03)", borderColor: "hsl(215 30% 78% / 0.12)" }}
            >
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-semibold text-foreground">{d.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{d.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Upload */}
      <div className="space-y-2">
        <p className="eyebrow text-[0.65rem]">Upload file</p>
        <input
          ref={fileRef}
          type="file"
          accept=".edf,.bdf,.csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          className="pill-button pill-button-secondary w-full disabled:opacity-60"
        >
          <Upload className="h-4 w-4" /> Choose .edf / .csv
        </button>
      </div>

      {/* URL */}
      <div className="space-y-2">
        <p className="eyebrow text-[0.65rem]">From URL</p>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/recording.edf"
            className="flex-1 rounded-full px-4 py-2 text-sm outline-none border focus:border-primary"
            style={{ background: "hsl(0 0% 100% / 0.04)", borderColor: "hsl(215 30% 70% / 0.16)", color: "hsl(var(--foreground))" }}
          />
          <button
            type="button"
            onClick={handleUrl}
            disabled={!!busy || !url.trim()}
            className="pill-button pill-button-primary disabled:opacity-60"
            aria-label="Fetch URL"
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">CORS must allow the request.</p>
      </div>

      {busy && (
        <div className="flex items-center gap-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" /> {busy}
        </div>
      )}
    </div>
  );
}
