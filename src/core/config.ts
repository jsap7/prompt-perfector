import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface RepoProfile {
  name: string;
  /** How Devin should verify work in this repo. */
  testCommand?: string;
  /** Conventions Devin should follow instead of inventing its own. */
  conventions?: string[];
  /** Directories Devin should never wander into. */
  offLimits?: string[];
}

export interface Config {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** $ per ACU. 2.00 on Team, 2.25 on Core. */
  perAcu: number;
  /** Applied to every prompt, so you stop retyping them. */
  standingConstraints: string[];
  repos: RepoProfile[];
  defaultRepo?: string;
}

export const DEFAULT_CONFIG: Config = {
  model: "claude-opus-5",
  effort: "medium",
  perAcu: 2.25,
  standingConstraints: [
    "Follow the patterns already in the touched files; do not introduce new libraries or abstractions.",
    "Do not reformat, rename, or refactor anything outside the stated scope.",
    "If something required is genuinely ambiguous, stop and ask instead of exploring the repo to decide.",
  ],
  repos: [],
};

export const PP_DIR = path.join(os.homedir(), ".pp");
export const CONFIG_PATH = path.join(PP_DIR, "config.json");

export function loadConfig(): Config {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      standingConstraints:
        parsed.standingConstraints ?? DEFAULT_CONFIG.standingConstraints,
      repos: parsed.repos ?? [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function ensureConfig(): string {
  fs.mkdirSync(PP_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  }
  return CONFIG_PATH;
}

export function findRepo(cfg: Config, hint: string | null): RepoProfile | null {
  if (!hint) {
    return cfg.repos.find((r) => r.name === cfg.defaultRepo) ?? null;
  }
  const lower = hint.toLowerCase();
  return (
    cfg.repos.find((r) => lower.includes(r.name.toLowerCase())) ??
    cfg.repos.find((r) => r.name === cfg.defaultRepo) ??
    null
  );
}
