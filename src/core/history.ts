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
      .map((l) => JSON.parse(l) as HistoryEntry);
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
