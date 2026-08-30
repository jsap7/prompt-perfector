export type Severity = "critical" | "high" | "medium" | "low";

/** One detected reason Devin would burn ACUs on this prompt. */
export interface Smell {
  id: string;
  severity: Severity;
  /** What was found, in the user's own words where possible. */
  evidence: string;
  /** Why this costs ACUs. */
  why: string;
  /** What to do instead. */
  fix: string;
  weight: number;
}

export interface Risk {
  /** 0 (surgical) .. 100 (Devin will wander the repo for an hour). */
  score: number;
  band: "tight" | "ok" | "loose" | "wide-open";
  acuLow: number;
  acuHigh: number;
  costLow: number;
  costHigh: number;
}

/** The structured Devin prompt PP emits. */
export interface PerfectedPrompt {
  title: string;
  repo: string | null;
  objective: string;
  filesInScope: string[];
  steps: string[];
  constraints: string[];
  outOfScope: string[];
  acceptance: string[];
  verification: string[];
  /** Things PP could not infer. The user fills these in for free; Devin would pay ACUs to find them. */
  gaps: string[];
  /** Separate asks that should be their own Devin session. */
  splitOut: string[];
  notes: string[];
}

export interface Analysis {
  raw: string;
  smells: Smell[];
  before: Risk;
}

export interface Result {
  analysis: Analysis;
  perfected: PerfectedPrompt;
  after: Risk;
  rendered: string;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
}
