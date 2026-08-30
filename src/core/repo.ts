import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Local repo intelligence.
 *
 * This is the offline mode's real advantage over the model: it can look. A
 * file path Devin would spend ACUs searching for is a `git ls-files` away, and
 * the answer is ground truth rather than an inference. Anything resolved here
 * costs nothing and cannot be hallucinated.
 */

export interface RepoContext {
  root: string | null;
  name: string | null;
  testCommand: string | null;
  files: string[];
}

function sh(cmd: string, args: string[], cwd: string): string | null {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

export function detectRepo(cwd = process.cwd()): RepoContext {
  const root = sh("git", ["rev-parse", "--show-toplevel"], cwd);
  if (!root) return { root: null, name: null, testCommand: null, files: [] };

  const remote = sh("git", ["remote", "get-url", "origin"], root);
  const name = remote
    ? (remote.replace(/\.git$/, "").split(/[/:]/).pop() ?? null)
    : path.basename(root);

  const listed = sh("git", ["ls-files"], root);
  const files = listed ? listed.split("\n").filter(Boolean) : [];

  return { root, name, testCommand: detectTestCommand(root), files };
}

function readJson(p: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function detectTestCommand(root: string): string | null {
  const pkg = readJson(path.join(root, "package.json"));
  if (pkg) {
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    if (scripts.test) {
      const runner = fs.existsSync(path.join(root, "pnpm-lock.yaml"))
        ? "pnpm"
        : fs.existsSync(path.join(root, "yarn.lock"))
          ? "yarn"
          : fs.existsSync(path.join(root, "bun.lockb"))
            ? "bun"
            : "npm";
      return `${runner} test`;
    }
  }

  const has = (f: string) => fs.existsSync(path.join(root, f));

  if (has("Makefile")) {
    try {
      const mk = fs.readFileSync(path.join(root, "Makefile"), "utf8");
      if (/^test\s*:/m.test(mk)) return "make test";
    } catch {
      /* unreadable Makefile */
    }
  }
  if (has("pytest.ini") || has("tox.ini")) return "pytest";
  if (has("pyproject.toml")) return "pytest";
  if (has("Cargo.toml")) return "cargo test";
  if (has("go.mod")) return "go test ./...";
  if (has("Gemfile")) return "bundle exec rspec";
  if (has("pom.xml")) return "mvn test";
  if (has("build.gradle") || has("build.gradle.kts")) return "gradle test";

  return null;
}

const PATH_STOP = new Set([
  "src", "lib", "app", "test", "tests", "spec", "index", "main", "dist",
  "node_modules", "packages", "components", "utils", "common", "core",
]);

/** Tokens in a path that are distinctive enough to match a spoken mention. */
function pathTokens(p: string): string[] {
  return p
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[^A-Za-z0-9]+/)
    .flatMap((seg) => seg.split(/(?=[A-Z])/))
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2 && !PATH_STOP.has(t));
}

export interface FileMatch {
  path: string;
  /** The word in the prompt that matched. */
  via: string;
  score: number;
}

const WORD_STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "then", "when",
  "you", "our", "its", "was", "are", "not", "but", "can", "has", "have", "one",
  "file", "files", "code", "thing", "stuff", "some", "any", "all", "make",
  "add", "fix", "change", "update", "remove", "run", "test", "tests", "need",
  "want", "should", "just", "like", "about", "where", "there", "here", "also",
]);

/**
 * Resolve loose spoken references ("the stripe file") to real paths.
 *
 * Only returns a match when the evidence is strong — a distinctive word that
 * hits few files. A wrong path is worse than no path, since Devin then hunts
 * for something that does not exist.
 */
export function resolveFiles(text: string, ctx: RepoContext, limit = 6): FileMatch[] {
  if (!ctx.files.length) return [];

  const index = new Map<string, string[]>();
  for (const f of ctx.files) {
    for (const t of pathTokens(f)) {
      const arr = index.get(t);
      if (arr) arr.push(f);
      else index.set(t, [f]);
    }
  }

  const words = [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !WORD_STOP.has(w)),
    ),
  ];

  const scored = new Map<string, FileMatch>();
  for (const w of words) {
    const hits = index.get(w);
    // A word matching half the repo tells us nothing.
    if (!hits || hits.length > 8) continue;
    for (const f of hits) {
      // Fewer hits = more distinctive. Shorter paths break ties.
      const score = 10 / hits.length + 1 / (f.split("/").length + 1);
      const prev = scored.get(f);
      if (!prev || score > prev.score) scored.set(f, { path: f, via: w, score });
    }
  }

  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
