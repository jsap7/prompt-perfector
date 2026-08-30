import type { PerfectedPrompt } from "./types.js";
import { normalize } from "./normalize.js";
import { detectRepo, resolveFiles, type RepoContext, type FileMatch } from "./repo.js";
import type { Config, RepoProfile } from "./config.js";

/**
 * Deterministic prompt construction — no model involved.
 *
 * Three things make this worth having rather than a degraded fallback:
 *
 *  1. It reads the actual repository, so file paths and test commands are
 *     looked up rather than inferred. That cannot be hallucinated.
 *  2. The highest-value part of the output — the prohibitions and stop
 *     conditions that keep Devin bounded — is boilerplate. It never needed a
 *     model.
 *  3. What it genuinely cannot determine becomes a question for the user,
 *     which beats a guess.
 */

const EXT = "ts|tsx|js|jsx|py|go|rb|rs|java|kt|php|cs|sql|json|ya?ml|toml|md|sh|css|scss|html|vue|svelte";

const EXPLICIT_PATH = new RegExp(
  `(?:[\\w.@-]+/[\\w./@-]+)|(?:\\b[\\w-]+\\.(?:${EXT})\\b)`,
  "g",
);

const COMMAND_SRC = `\\b(?:npm|yarn|pnpm|bun|make|pytest|jest|vitest|tox|rspec|phpunit|mvn|gradle|cargo|dotnet|tsc|eslint|ruff|mypy|docker|curl)\\b[^.;\\n]*`;
const COMMAND = new RegExp(COMMAND_SRC, "gi");
/** Non-global twin: `.test()` on a /g regex is stateful and alternates results. */
const COMMAND_TEST = new RegExp(COMMAND_SRC, "i");

const NEGATIVE =
  /\b(do not|don't|dont|never|avoid|without|no need to|leave .* alone|keep .* as is|don't touch|stay away from)\b/i;

const ACCEPTANCE =
  /\b(should|must|so that|such that|expects?|returns?|no longer|instead of|rather than|until|ends? up|results? in)\b/i;

const ACTION =
  /\b(add|create|fix|remove|delete|update|change|rename|move|write|implement|migrate|bump|upgrade|wire|hook|expose|handle|support|replace|revert|set|raise|lower|increase|decrease|switch|extract|split|merge|rename)\b/i;

/** Prohibitions worth stating on every task, regardless of what it is. */
const BASE_PROHIBITIONS = [
  "Do not modify files outside the list above.",
  "Do not reformat, rename, or refactor code unrelated to this change.",
  "Do not upgrade, add, or remove dependencies.",
  "Do not broaden test coverage beyond what this change requires.",
];

/**
 * Split into clauses, not sentences.
 *
 * Dictation frequently arrives as one long comma-spliced run with no
 * sentence-ending punctuation, so splitting on `.` alone leaves a single
 * blob — and one negative phrase anywhere in it ("don't touch the UI") then
 * misclassifies the entire request.
 */
const CLAUSE_MARKER =
  /,\s*(?=(?:and|but|then|also|plus|although|though|while|so|dont|don't|do not|never|avoid|make sure|makes sure|it should|they should|which should|that should|so that|leave|keep|verify|verifying|confirm|check|run)\b)/i;

function clauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .flatMap((s) => s.split(CLAUSE_MARKER))
    .flatMap((s) => (s.length > 160 ? s.split(/,\s+/) : [s]))
    .map((s) =>
      s
        .trim()
        .replace(/^[-*•]\s*/, "")
        .replace(/^(?:and|but|then|also|plus|so)\s+/i, "")
        .replace(/[.,;]+$/, ""),
    )
    .filter((s) => s.length > 3);
}

/** "go into src/foo.ts and add X" -> "add X"; the path is captured separately. */
function stripNavigation(s: string): string {
  return s
    .replace(
      /^(?:go\s+(?:in)?to|open|head\s+(?:in)?to|jump\s+(?:in)?to|look\s+at|navigate\s+to|in|inside|within)\s+[\w./@-]+(?:\s+and)?\s*/i,
      "",
    )
    .replace(/^(?:file|the\s+file)\s+[\w./@-]+\s*(?:,|and)?\s*/i, "")
    .trim();
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deriveTitle(objective: string): string {
  // Cut at the first subordinate clause so the title is a phrase, not a fragment.
  const head = objective
    .replace(/^(please\s+)?/i, "")
    .split(/\s+(?:that|which|when|where|so|because|if|after|before)\s+/i)[0]!
    .replace(/[,;]\s*(?:verify|confirm|check|run|then)\b.*$/i, "")
    .trim();
  const words = head.split(/\s+/).slice(0, 8).join(" ").replace(/[.,;:]$/, "");
  return titleCase(words) || "Untitled task";
}

export interface OfflineResult {
  perfected: PerfectedPrompt;
  /** What normalization cleaned up. */
  changes: string[];
  /** Files resolved from the local repo rather than stated outright. */
  resolved: FileMatch[];
  repo: RepoContext;
}

export function extractOffline(
  raw: string,
  config: Config,
  cwd = process.cwd(),
): OfflineResult {
  const { text, changes } = normalize(raw);
  const ctx = detectRepo(cwd);
  const profile: RepoProfile | undefined =
    config.repos.find((r) => r.name === ctx.name) ??
    config.repos.find((r) => r.name === config.defaultRepo);

  const parts = clauses(text);

  // --- files -------------------------------------------------------------
  const explicit = [...new Set(text.match(EXPLICIT_PATH) ?? [])].filter(
    (p) => !/^\d+\.\d+$/.test(p),
  );

  // Only look up what was not stated outright.
  const resolved = explicit.length ? [] : resolveFiles(text, ctx, 5);
  const knownGood = new Set(ctx.files);
  const files = [
    ...explicit.filter((p) => !ctx.files.length || knownGood.has(p) || !p.includes("/")),
    ...resolved.filter((m) => m.score >= 2).map((m) => m.path),
  ];

  // --- verification ------------------------------------------------------
  const spokenCommands = [...new Set(text.match(COMMAND) ?? [])].map((c) => c.trim());
  const verification = spokenCommands.length
    ? spokenCommands
    : profile?.testCommand
      ? [profile.testCommand]
      : ctx.testCommand
        ? [ctx.testCommand]
        : [];

  // --- sentence classification ------------------------------------------
  const steps: string[] = [];
  const acceptance: string[] = [];
  const prohibitions: string[] = [];

  for (const raw2 of parts) {
    const s = stripNavigation(raw2);
    if (!s) continue;
    if (NEGATIVE.test(s)) {
      prohibitions.push(titleCase(s.replace(/\.$/, "")) + ".");
      continue;
    }
    if (COMMAND_TEST.test(s)) continue; // captured as verification already
    if (ACCEPTANCE.test(s)) acceptance.push(titleCase(s.replace(/\.$/, "")) + ".");
    if (ACTION.test(s)) steps.push(titleCase(s.replace(/\.$/, "")) + ".");
  }

  const objective = steps[0] ?? parts.map(stripNavigation).find(Boolean) ?? text.slice(0, 140);

  // --- constraints -------------------------------------------------------
  const constraints = [
    ...(profile?.conventions ?? []),
    ...config.standingConstraints,
  ];

  // --- prohibitions ------------------------------------------------------
  const outOfScope = [...prohibitions, ...BASE_PROHIBITIONS];
  for (const dir of profile?.offLimits ?? []) {
    outOfScope.push(`Never modify anything under \`${dir}\`.`);
  }

  // --- gaps: what a model would have guessed, asked instead --------------
  const gaps: string[] = [];
  if (!files.length) {
    gaps.push(
      ctx.files.length
        ? "Which files should change? Nothing in the request matched a path in this repo."
        : "Which files should change? Run PP from inside the repo and it can look them up.",
    );
  }
  if (!verification.length) {
    gaps.push("What command verifies this worked?");
  }
  if (!acceptance.length) {
    gaps.push("What is observably true when this is done?");
  }

  const notes: string[] = [];
  if (changes.length) notes.push(changes.join("; ") + ".");
  if (resolved.length && files.length) {
    notes.push(
      `Paths resolved from the local repo (matched on: ${[
        ...new Set(resolved.filter((m) => m.score >= 2).map((m) => m.via)),
      ].join(", ")}) — confirm before sending.`,
    );
  }
  if (ctx.testCommand && !spokenCommands.length) {
    notes.push(`Verification command detected from the repo, not from what you said.`);
  }

  return {
    perfected: {
      title: deriveTitle(objective),
      repo: profile?.name ?? ctx.name,
      objective: objective,
      filesInScope: [...new Set(files)],
      steps: steps.length > 1 ? steps : [],
      constraints,
      outOfScope,
      acceptance,
      verification,
      gaps,
      splitOut: [],
      notes,
    },
    changes,
    resolved,
    repo: ctx,
  };
}
