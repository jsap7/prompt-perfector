import fs from "node:fs";
import path from "node:path";
import { PP_DIR } from "./config.js";

const HISTORY_PATH = path.join(PP_DIR, "history.jsonl");

export interface HistoryEntry {
  at: string;
  raw: string;
  rendered: string;
  scoreBefore: number;
  scoreAfter: number;
  savedAcuLow: number;
  savedAcuHigh: number;
  /** Structured fields, added in 0.2 for playbook detection. Older rows lack them. */
  title?: string;
  repo?: string | null;
  objective?: string;
  filesInScope?: string[];
  steps?: string[];
  verification?: string[];
}

export function record(entry: HistoryEntry): void {
  try {
    fs.mkdirSync(PP_DIR, { recursive: true });
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + "\n");
  } catch {
    /* history is a convenience; never block the user on it */
  }
}

export function readAll(): HistoryEntry[] {
  try {
    return fs
      .readFileSync(HISTORY_PATH, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as HistoryEntry];
        } catch {
          return []; // skip a torn line rather than losing the whole file
        }
      });
  } catch {
    return [];
  }
}

export function stats(): {
  runs: number;
  acuSavedLow: number;
  acuSavedHigh: number;
} {
  const all = readAll();
  return {
    runs: all.length,
    acuSavedLow: +all.reduce((n, e) => n + e.savedAcuLow, 0).toFixed(1),
    acuSavedHigh: +all.reduce((n, e) => n + e.savedAcuHigh, 0).toFixed(1),
  };
}
