import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PP_DIR } from "./config.js";
import { detectTestCommand } from "./repo.js";

/**
 * A cached, content-aware index of a repository.
 *
 * Two problems this solves over `detectRepo(cwd)`:
 *
 *  1. You dictate from wherever you happen to be, not from inside the repo the
 *     task concerns. Registered repos resolve from anywhere.
 *  2. Path-token matching alone is lexical — "the payment thing" never finds
 *     `billing.ts`. Indexing symbols and file contents fixes that without
 *     needing a model or embeddings.
 */

export interface SymbolRef {
  name: string;
  file: string;
  line: number;
  kind: string;
}

export interface RepoIndex {
  name: string;
  root: string;
  indexedAt: string;
  testCommand: string | null;
  files: string[];
  symbols: SymbolRef[];
  /** token -> files containing it. Only distinctive tokens are kept. */
  tokens: Record<string, string[]>;
  offLimits: string[];
  conventions: string[];
}

const INDEX_DIR = path.join(PP_DIR, "index");
const REGISTRY = path.join(PP_DIR, "repos.json");

const MAX_FILES = 6000;
const MAX_FILE_BYTES = 400_000;
/** A token in more files than this tells you nothing about which file to pick. */
const MAX_TOKEN_FANOUT = 8;

const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rb", ".rs",
  ".java", ".kt", ".php", ".cs", ".swift", ".scala", ".sql", ".sh", ".vue",
  ".svelte", ".css", ".scss", ".md", ".yml", ".yaml", ".json", ".toml",
]);

const SKIP_DIR =
  /(^|\/)(node_modules|\.git|dist|build|out|target|vendor|__pycache__|\.next|\.venv|coverage)(\/|$)/;

function sh(cmd: string, args: string[], cwd: string): string | null {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

// --- symbol extraction ----------------------------------------------------

const SYMBOL_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "function", re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/ },
  { kind: "class", re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_]\w*)/ },
  { kind: "const", re: /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_]\w*)\s*[:=]\s*(?:async\s*)?(?:\(|function|\[|\{)/ },
  { kind: "type", re: /^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_]\w*)/ },
  { kind: "def", re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ },
  { kind: "func", re: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/ },
  { kind: "fn", re: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/ },
  { kind: "method", re: /^\s*(?:public|private|protected|internal)\s+(?:static\s+)?[\w<>\[\],\s]+\s+([A-Za-z_]\w*)\s*\(/ },
];

const IDENT = /[A-Za-z_][A-Za-z0-9_]{2,}/g;

const TOKEN_STOP = new Set([
  "the", "and", "for", "this", "that", "with", "from", "import", "export",
  "const", "let", "var", "function", "return", "class", "type", "interface",
  "string", "number", "boolean", "void", "null", "undefined", "true", "false",
  "async", "await", "new", "case", "break", "default", "static", "public",
  "private", "protected", "def", "self", "else", "elif", "then", "end", "nil",
  "err", "error", "value", "values", "data", "item", "items", "result", "args",
  "props", "state", "length", "name", "names", "key", "keys", "map",
  "set", "get", "add", "list", "text", "path", "file", "files", "test", "tests",
  "src", "lib", "app", "util", "utils", "common", "core", "index", "main",
]);

function splitIdent(id: string): string[] {
  return id
    .split(/(?=[A-Z])|_/)
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 2 && !TOKEN_STOP.has(s));
}

const NUL = String.fromCharCode(0);

export function buildIndex(root: string, name?: string): RepoIndex {
  const listed = sh("git", ["ls-files"], root);
  if (listed === null) throw new Error(`${root} is not a git repository.`);

  const all = listed.split("\n").filter(Boolean).filter((f) => !SKIP_DIR.test(f));
  const files = all.slice(0, MAX_FILES);

  const remote = sh("git", ["remote", "get-url", "origin"], root);
  const repoName =
    name ??
    (remote
      ? (remote.replace(/\.git$/, "").split(/[/:]/).pop() ?? path.basename(root))
      : path.basename(root));

  const symbols: SymbolRef[] = [];
  const tokenMap = new Map<string, Set<string>>();

  const addToken = (tok: string, file: string) => {
    let s = tokenMap.get(tok);
    if (!s) tokenMap.set(tok, (s = new Set()));
    s.add(file);
  };

  for (const f of files) {
    // Path tokens always count — they are the strongest signal.
    for (const t of splitIdent(f.replace(/\.[a-z0-9]+$/i, "").replace(/[/-]/g, "_"))) {
      addToken(t, f);
    }

    if (!CODE_EXT.has(path.extname(f))) continue;

    let content: string;
    try {
      const full = path.join(root, f);
      if (fs.statSync(full).size > MAX_FILE_BYTES) continue;
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (content.includes(NUL)) continue; // binary

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.length > 400) continue;
      for (const { kind, re } of SYMBOL_PATTERNS) {
        const m = re.exec(line);
        if (m?.[1] && m[1].length > 2) {
          symbols.push({ name: m[1], file: f, line: i + 1, kind });
          for (const t of splitIdent(m[1])) addToken(t, f);
          break;
        }
      }
    }

    // Content identifiers, capped so one huge file cannot dominate.
    const idents = content.match(IDENT) ?? [];
    const local = new Set<string>();
    for (let i = 0; i < idents.length && i < 4000; i++) {
      for (const t of splitIdent(idents[i]!)) local.add(t);
    }
    for (const t of local) addToken(t, f);
  }

  // Keep only tokens distinctive enough to point somewhere.
  const tokens: Record<string, string[]> = {};
  for (const [tok, set] of tokenMap) {
    if (set.size <= MAX_TOKEN_FANOUT) tokens[tok] = [...set];
  }

  return {
    name: repoName,
    root,
    indexedAt: new Date().toISOString(),
    testCommand: detectTestCommand(root),
    files,
    symbols: symbols.slice(0, 40_000),
    tokens,
    offLimits: detectOffLimits(files),
    conventions: detectConventions(root, files),
  };
}

function detectOffLimits(files: string[]): string[] {
  const out = new Set<string>();
  for (const f of files) {
    if (
      /(^|\/)(generated|__generated__|migrations|fixtures|snapshots|__snapshots__|proto|vendor|third_party)\//.test(f)
    ) {
      const seg = f.split("/").slice(0, -1).join("/");
      if (seg) out.add(seg + "/");
    }
    if (/\.(pb|generated|g)\.(go|ts|py|dart)$/.test(f)) out.add(path.dirname(f) + "/");
  }
  return [...out].slice(0, 8);
}

function detectConventions(root: string, files: string[]): string[] {
  const out: string[] = [];
  const has = (p: string) => fs.existsSync(path.join(root, p));
  const anyFile = (re: RegExp) => files.some((f) => re.test(f));

  if (has("tsconfig.json")) {
    try {
      const tsc = fs.readFileSync(path.join(root, "tsconfig.json"), "utf8");
      if (/"strict"\s*:\s*true/.test(tsc)) {
        out.push("TypeScript strict mode is on; keep types exact.");
      }
    } catch {
      /* unreadable tsconfig */
    }
  }
  if (anyFile(/(^|\/)\.eslintrc|eslint\.config\./)) {
    out.push("ESLint is configured; match the existing lint rules.");
  }
  if (anyFile(/(^|\/)\.prettierrc|prettier\.config\./)) {
    out.push("Prettier owns formatting; do not hand-format.");
  }
  if (anyFile(/(^|\/)(__tests__|tests?)\//) || anyFile(/\.(test|spec)\.[jt]sx?$/)) {
    out.push("Tests live beside the code they cover; follow the existing test layout.");
  }
  if (has("go.mod")) out.push("Go module; keep to the standard project layout.");
  if (has("pyproject.toml")) out.push("Python project configured via pyproject.toml.");
  return out.slice(0, 6);
}

// --- registry persistence -------------------------------------------------

export interface RegistryEntry {
  name: string;
  root: string;
  indexedAt: string;
  fileCount: number;
  symbolCount: number;
}

export function loadRegistry(): RegistryEntry[] {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY, "utf8")) as RegistryEntry[];
  } catch {
    return [];
  }
}

function saveRegistry(entries: RegistryEntry[]): void {
  fs.mkdirSync(PP_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY, JSON.stringify(entries, null, 2) + "\n");
}

const indexPath = (name: string) =>
  path.join(INDEX_DIR, name.replace(/[^\w.-]/g, "_") + ".json");

export function saveIndex(idx: RepoIndex): RegistryEntry {
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  fs.writeFileSync(indexPath(idx.name), JSON.stringify(idx));

  const entry: RegistryEntry = {
    name: idx.name,
    root: idx.root,
    indexedAt: idx.indexedAt,
    fileCount: idx.files.length,
    symbolCount: idx.symbols.length,
  };
  const reg = loadRegistry().filter((r) => r.name !== idx.name);
  reg.push(entry);
  saveRegistry(reg);
  return entry;
}

export function loadIndex(name: string): RepoIndex | null {
  try {
    return JSON.parse(fs.readFileSync(indexPath(name), "utf8")) as RepoIndex;
  } catch {
    return null;
  }
}

export function removeIndex(name: string): boolean {
  const reg = loadRegistry();
  const next = reg.filter((r) => r.name !== name);
  if (next.length === reg.length) return false;
  saveRegistry(next);
  try {
    fs.unlinkSync(indexPath(name));
  } catch {
    /* already gone */
  }
  return true;
}

/** Pick the registered repo the text names, if any. */
export function pickRepo(text: string): RepoIndex | null {
  const lower = text.toLowerCase();
  const reg = loadRegistry();
  // Longest name first so "checkout-api" wins over "checkout".
  const hit = reg
    .slice()
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) =>
      new RegExp(
        `\\b${r.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ).test(lower),
    );
  return hit ? loadIndex(hit.name) : null;
}

// --- resolution -----------------------------------------------------------

export interface IndexMatch {
  path: string;
  via: string[];
  score: number;
  /** A specific definition inside the file, when one matched by name. */
  symbol?: SymbolRef;
}

const QUERY_STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "then", "when",
  "you", "our", "its", "was", "are", "not", "but", "can", "has", "have", "one",
  "file", "files", "code", "thing", "stuff", "some", "any", "all", "make",
  "add", "fix", "change", "update", "remove", "run", "need", "want", "should",
  "just", "like", "about", "where", "there", "here", "also", "make", "using",
  "logic", "part", "bit", "side", "new", "old",
]);

/**
 * Resolve a spoken request against a built index.
 *
 * Scores files by how distinctive the matching tokens are — a token found in
 * one file is far stronger evidence than one found in eight. Symbol-name hits
 * outrank plain content hits, because pointing Devin at a function is a
 * tighter anchor than pointing it at a file.
 */
export function resolveAgainstIndex(
  text: string,
  idx: RepoIndex,
  limit = 6,
): IndexMatch[] {
  const words = [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !QUERY_STOP.has(w)),
    ),
  ];
  if (!words.length) return [];

  const wordSet = new Set(words);
  const acc = new Map<string, { score: number; via: Set<string>; symbol?: SymbolRef }>();

  const bump = (file: string, amount: number, via: string, symbol?: SymbolRef) => {
    let e = acc.get(file);
    if (!e) acc.set(file, (e = { score: 0, via: new Set() }));
    e.score += amount;
    e.via.add(via);
    if (symbol && !e.symbol) e.symbol = symbol;
  };

  for (const w of words) {
    const hits = idx.tokens[w];
    if (!hits) continue;
    // Inverse-fanout: rarer token, stronger signal.
    const weight = 6 / hits.length;
    for (const f of hits) bump(f, weight, w);
  }

  // Symbol names are the tightest anchor available.
  for (const sym of idx.symbols) {
    const parts = splitIdent(sym.name);
    if (!parts.length) continue;
    const overlap = parts.filter((p) => wordSet.has(p)).length;
    if (!overlap) continue;
    // Whole symbol matched vs. only part of it.
    const strength = overlap === parts.length ? 8 : 3 * (overlap / parts.length);
    bump(sym.file, strength, sym.name, sym);
  }

  return [...acc.entries()]
    .map(([p, e]) => ({
      path: p,
      via: [...e.via].slice(0, 4),
      score: e.score + 1 / (p.split("/").length + 1),
      symbol: e.symbol,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
