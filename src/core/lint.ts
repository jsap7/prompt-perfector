import type { Smell, Risk, Analysis } from "./types.js";

/**
 * Every rule here encodes something Cognition explicitly names as a driver of
 * Devin's exploration mode: unmade decisions, missing file paths, absent
 * success criteria, no verification step, unbounded scope.
 * ACUs bill agent wall-clock (~1 ACU = 15 min of active work), so anything
 * that makes Devin *search* instead of *act* is money.
 */

interface Rule {
  id: string;
  severity: Smell["severity"];
  weight: number;
  why: string;
  fix: string;
  /** Returns the matched evidence, or null. */
  test: (text: string, lower: string) => string | null;
}

const phrase = (words: string[]) =>
  new RegExp(`\\b(${words.map((w) => w.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");

const firstMatch = (re: RegExp, text: string): string | null => {
  const m = text.match(re);
  if (!m) return null;
  const uniq = [...new Set(m.map((s) => s.toLowerCase().replace(/\s+/g, " ")))];
  return uniq.slice(0, 4).join(", ");
};

const EXPLORE_VERBS = [
  "investigate", "explore", "look into", "look at", "look through", "look over",
  "figure out", "dig into", "dig around", "poke around", "research", "audit",
  "familiarize", "get familiar", "understand the", "analyze the", "review the",
  "see why", "see if", "see what", "find out", "work out why", "track down",
  "have a look", "take a look", "go through the", "read through",
];

const VAGUE_IMPROVE = [
  "improve", "optimize", "clean up", "cleanup", "refactor", "modernize",
  "tidy up", "polish", "make it better", "make this better", "speed up",
  "enhance", "streamline", "tighten up", "harden", "future proof",
  "future-proof", "best practices", "more robust", "more maintainable",
];

const SCOPE_EXPLOSION = [
  "the whole codebase", "entire codebase", "the codebase", "across the repo",
  "the whole repo", "entire repo", "all the files", "every file", "everywhere",
  "all over", "throughout the", "anywhere else", "the whole app",
  "the entire app", "all of our", "every single",
];

const OPEN_TAIL = [
  "and anything else", "anything else you", "etc", "and so on", "as needed",
  "if you see anything", "while you're in there", "while you are in there",
  "also fix any", "and whatever else", "and any other", "plus anything",
  "feel free to", "if you find any", "and clean up any",
];

const DEFERRED_DECISION = [
  "you decide", "whatever you think", "up to you", "your call",
  "best approach", "the best way", "figure out the best", "whatever makes sense",
  "however you want", "use your judgement", "use your judgment",
  "whatever is cleanest", "you choose", "pick whichever",
];

const HEDGES = [
  "maybe", "i think", "i believe", "probably", "not sure", "somewhere",
  "something like", "or something", "i guess", "kind of", "sort of",
  "might be", "could be", "i forget", "one of those", "some file",
];

const FULL_SUITE = [
  "run all the tests", "run the full test suite", "run the whole test suite",
  "run every test", "run all tests", "full ci", "the entire suite",
];

const FILLER = [
  "um", "uh", "like i said", "you know", "basically", "i mean", "so yeah",
  "anyway", "right so", "okay so", "ok so", "let me think", "actually wait",
];

/** Does the text point at concrete code? Paths, extensions, identifiers. */
const CODE_REF =
  /(?:[\w.-]+\/[\w./-]+)|(?:\b[\w-]+\.(?:ts|tsx|js|jsx|py|go|rb|rs|java|kt|php|cs|sql|json|ya?ml|toml|md|sh|css|scss|html|vue|svelte)\b)|(?:`[^`]+`)|(?:\b\w+\(\))|(?:\b[a-z]+[A-Z]\w+\b)|(?:\b[A-Z][a-z]+[A-Z]\w+\b)|(?:\b\w+_\w+\b)/;

/** Does the text define what "done" means? */
const ACCEPTANCE =
  /\b(should|must|expect(?:ed|s)?|returns?|so that|such that|acceptance|criteria|pass(?:es|ing)?|assert|equals?|status\s*\d{3}|instead of|rather than|no longer|until)\b/i;

/** Does the text name a command to prove it works? */
const VERIFY =
  /\b(npm|yarn|pnpm|bun|make|pytest|jest|vitest|go test|cargo|mvn|gradle|tox|rspec|phpunit|dotnet|tsc|eslint|ruff|mypy|docker|curl)\b|\b(run|running)\s+(?:the\s+|all\s+(?:the\s+)?|every\s+|full\s+|whole\s+)?(tests?|lint|build|typecheck|suite)\b/i;

const REPO =
  /\b(repo|repository|monorepo|in\s+the\s+[\w-]+\s+(?:repo|service|project|package)|github\.com\/[\w-]+\/[\w.-]+)\b/i;

const RULES: Rule[] = [
  {
    id: "NO_PATHS",
    severity: "critical",
    weight: 26,
    why: "Nothing points at a file, function, or symbol, so Devin's first move is to read the repo to find the code. On a large repo that search alone can run an ACU before it edits a line.",
    fix: "Name the files. Even one anchor path collapses the search.",
    test: (text) => (CODE_REF.test(text) ? null : "no file paths or code identifiers anywhere"),
  },
  {
    id: "EXPLORE_VERB",
    severity: "critical",
    weight: 20,
    why: "These verbs are an instruction to go read things. Devin bills wall-clock while it reads, and open-ended reading has no natural stopping point.",
    fix: "Replace the verb with the concrete change you already believe is needed. If you genuinely don't know, do that lookup yourself first — it's free.",
    test: (t) => firstMatch(phrase(EXPLORE_VERBS), t),
  },
  {
    id: "NO_ACCEPTANCE",
    severity: "high",
    weight: 16,
    why: "With no definition of done, Devin keeps going, second-guesses itself, and gold-plates. Cognition calls missing success criteria one of the top causes of wasted sessions.",
    fix: "State the observable end state: what should be true when it's finished.",
    test: (text) => (ACCEPTANCE.test(text) ? null : "no success criteria — nothing defines 'done'"),
  },
  {
    id: "VAGUE_IMPROVE",
    severity: "high",
    weight: 15,
    why: "Improvement words with no metric ('improve performance') force Devin to first decide what better means, then hunt for candidates. That's two unbounded searches stacked.",
    fix: "Name the specific thing and the target: which query, which endpoint, from what to what.",
    test: (t) => firstMatch(phrase(VAGUE_IMPROVE), t),
  },
  {
    id: "NO_VERIFY",
    severity: "high",
    weight: 13,
    why: "Without a named command Devin picks its own verification — often the full suite, repeatedly. Test runs are VM minutes, and VM minutes are ACUs.",
    fix: "Give the exact command, scoped as narrowly as it can be.",
    test: (text) => (VERIFY.test(text) ? null : "no verification command given"),
  },
  {
    id: "DEFERRED_DECISION",
    severity: "high",
    weight: 14,
    why: "Handing a design decision to Devin means it explores alternatives before writing code — the single most expensive failure mode in the docs.",
    fix: "Make the call yourself. Deciding costs you 30 seconds; Devin deciding costs ACUs.",
    test: (t) => firstMatch(phrase(DEFERRED_DECISION), t),
  },
  {
    id: "SCOPE_EXPLOSION",
    severity: "critical",
    weight: 18,
    why: "Repo-wide scope means repo-wide reading. Cost scales with how much Devin has to look at, not how much it changes.",
    fix: "Bound it to a directory or an explicit file list.",
    test: (t) => firstMatch(phrase(SCOPE_EXPLOSION), t),
  },
  {
    id: "OPEN_TAIL",
    severity: "high",
    weight: 12,
    why: "An open-ended tail turns a bounded task into a scavenger hunt — Devin will keep finding 'anything else'.",
    fix: "Cut it. Put anything real into its own session.",
    test: (t) => firstMatch(phrase(OPEN_TAIL), t),
  },
  {
    id: "HEDGE",
    severity: "medium",
    weight: 9,
    why: "Every hedge is a fact Devin now has to establish by searching. 'Somewhere in the auth code' is a repo scan.",
    fix: "Resolve the hedge before you send it, or mark it explicitly as an assumption Devin should not verify.",
    test: (t) => firstMatch(phrase(HEDGES), t),
  },
  {
    id: "FULL_SUITE",
    severity: "medium",
    weight: 10,
    why: "The full suite bills as VM time on every iteration, and Devin iterates.",
    fix: "Name the specific test file or filter, and say to run the full suite only once at the end.",
    test: (t) => firstMatch(phrase(FULL_SUITE), t),
  },
  {
    id: "NO_REPO",
    severity: "medium",
    weight: 7,
    why: "Devin spends its opening moves working out where it is.",
    fix: "Lead with the repo name.",
    test: (text) => (REPO.test(text) ? null : "repo not named"),
  },
  {
    id: "FILLER",
    severity: "low",
    weight: 2,
    why: "Dictation filler. Cheap, but it buries the actual instruction and Devin weighs every sentence.",
    fix: "Stripped automatically.",
    test: (t) => firstMatch(phrase(FILLER), t),
  },
];

/** Rough count of distinct asks — each unrelated ask should be its own session. */
export function countGoals(text: string): number {
  const parts = text
    .split(/(?:\.|;|\n|\band then\b|\balso\b|\bafter that\b|\bplus\b|\boh and\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  const ACTION =
    /\b(add|create|fix|remove|delete|update|change|rename|move|write|implement|migrate|bump|wire|hook|expose|handle|support|replace|revert)\b/i;
  return parts.filter((p) => ACTION.test(p)).length;
}

export function lint(raw: string): Smell[] {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const found: Smell[] = [];

  for (const rule of RULES) {
    const evidence = rule.test(text, lower);
    if (evidence) {
      found.push({
        id: rule.id,
        severity: rule.severity,
        evidence,
        why: rule.why,
        fix: rule.fix,
        weight: rule.weight,
      });
    }
  }

  const goals = countGoals(text);
  if (goals >= 3) {
    found.push({
      id: "MULTI_GOAL",
      severity: "high",
      weight: 11,
      evidence: `${goals} separate asks in one prompt`,
      why: "Cognition recommends one session per task. Bundled asks share a context window, so late work pays to re-read everything from the earlier work.",
      fix: "Split into separate Devin sessions. PP has flagged which ones.",
    });
  }

  if (text.length > 0 && text.length < 60) {
    found.push({
      id: "TOO_THIN",
      severity: "critical",
      weight: 22,
      evidence: `${text.length} characters`,
      why: "A one-liner leaves nearly everything unspecified. Devin fills the gap with exploration, which is the expensive path.",
      fix: "Say what file, what change, and what done looks like.",
    });
  }

  return found.sort((a, b) => b.weight - a.weight);
}

const PER_ACU_DEFAULT = 2.25;

export function score(smells: Smell[], perAcu = PER_ACU_DEFAULT): Risk {
  const total = smells.reduce((n, s) => n + s.weight, 0);
  const s = Math.min(100, Math.round(total));

  // Bands calibrated to Cognition's published usage shapes: tightly scoped
  // tasks land under an ACU; ambiguous work on a big repo runs 5-10+.
  let band: Risk["band"];
  let acuLow: number;
  let acuHigh: number;
  if (s <= 20) [band, acuLow, acuHigh] = ["tight", 0.3, 1];
  else if (s <= 45) [band, acuLow, acuHigh] = ["ok", 1, 3];
  else if (s <= 70) [band, acuLow, acuHigh] = ["loose", 3, 7];
  else [band, acuLow, acuHigh] = ["wide-open", 7, 15];

  return {
    score: s,
    band,
    acuLow,
    acuHigh,
    costLow: +(acuLow * perAcu).toFixed(2),
    costHigh: +(acuHigh * perAcu).toFixed(2),
  };
}

export function analyze(raw: string, perAcu?: number): Analysis {
  const smells = lint(raw);
  return { raw, smells, before: score(smells, perAcu) };
}
