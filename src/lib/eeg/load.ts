import { parseEDF } from "./parseEDF";
import { parseCSV } from "./parseCSV";
import type { EEGRecording } from "./types";

export async function loadFromFile(file: File): Promise<EEGRecording> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "edf" || ext === "bdf") {
    const buf = await file.arrayBuffer();
    const rec = await parseEDF(buf, file.name);
    rec.source = "upload";
    return rec;
  }
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const text = await file.text();
    const rec = parseCSV(text, file.name);
    rec.source = "upload";
    return rec;
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

export async function loadFromUrl(url: string): Promise<EEGRecording> {
  const resp = await fetch(url, { mode: "cors" });
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
  const name = url.split("/").pop() || "remote";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "edf" || ext === "bdf") {
    const buf = await resp.arrayBuffer();
    const rec = await parseEDF(buf, name);
    rec.source = "url";
    return rec;
  }
  const text = await resp.text();
  const rec = parseCSV(text, name);
  rec.source = "url";
  return rec;
}
