import fs from "node:fs";
import path from "node:path";
import { buildIndex, type RepoIndex, type SymbolRef } from "./repoIndex.js";

/**
 * Whole-project analysis.
 *
 * Everything here is discovered from the repo rather than configured. The
 * person running `pp init` should not have to answer questions about their own
 * layout — the answers are on disk, and asking is how these tools end up
 * unused.
 */

export type AreaKind = "frontend" | "backend" | "package" | "infra";

export interface Area {
  name: string;
  /** Relative to repo root. "" means the root itself. */
  dir: string;
  kind: AreaKind;
  stack: string[];
  files: string[];
}

export type SuiteKind = "unit" | "integration" | "e2e";

export interface TestSuite {
  kind: SuiteKind;
  runner: string;
  /** Narrow command shape for this suite. */
  command: string;
  dirs: string[];
  fileCount: number;
}

export interface RouteRef {
  method: string;
  path: string;
  file: string;
  line: number;
}

export interface ModelRef {
  name: string;
  kind: string;
  file: string;
  line: number;
}

export interface ComponentRef {
  name: string;
  file: string;
  line: number;
}

export interface Project {
  root: string;
  name: string;
  index: RepoIndex;
  areas: Area[];
  tests: TestSuite[];
  routes: RouteRef[];
  models: ModelRef[];
  components: ComponentRef[];
  conventions: string[];
  offLimits: string[];
  /** Things worth telling a human we could not work out. */
  unknowns: string[];
}

const readText = (p: string): string | null => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

const readJson = (p: string): Record<string, any> | null => {
  const t = readText(p);
  if (!t) return null;
  try {
    return JSON.parse(t) as Record<string, any>;
  } catch {
    return null;
  }
};

// --- areas ----------------------------------------------------------------

const FRONTEND_DEPS = ["react", "next", "vue", "svelte", "@angular/core", "solid-js"];
const BACKEND_PY = ["fastapi", "django", "flask", "starlette", "sanic", "tornado"];

function depsOf(pkg: Record<string, any> | null): string[] {
  if (!pkg) return [];
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ];
}

function pyDeps(root: string, dir: string): string[] {
  const out: string[] = [];
  const pyproject = readText(path.join(root, dir, "pyproject.toml"));
  const reqs = readText(path.join(root, dir, "requirements.txt"));
  const blob = `${pyproject ?? ""}\n${reqs ?? ""}`.toLowerCase();
  for (const d of BACKEND_PY) if (blob.includes(d)) out.push(d);
  if (blob.includes("sqlalchemy")) out.push("sqlalchemy");
  if (blob.includes("pydantic")) out.push("pydantic");
  if (blob.includes("pytest")) out.push("pytest");
  return out;
}

/** Directories holding a project manifest, which is what an "area" really is. */
function manifestDirs(files: string[]): { dir: string; manifest: string }[] {
  const out: { dir: string; manifest: string }[] = [];
  const MANIFESTS = ["package.json", "pyproject.toml", "setup.py", "requirements.txt", "go.mod", "Cargo.toml"];
  for (const f of files) {
    const base = path.basename(f);
    if (!MANIFESTS.includes(base)) continue;
    const dir = path.dirname(f) === "." ? "" : path.dirname(f);
    if (dir.split("/").length > 3) continue; // too deep to be a real area
    out.push({ dir, manifest: base });
  }
  return out;
}

function detectAreas(root: string, index: RepoIndex): Area[] {
  const seen = new Map<string, Area>();

  for (const { dir, manifest } of manifestDirs(index.files)) {
    const inDir = index.files.filter((f) =>
      dir === "" ? true : f.startsWith(dir + "/"),
    );
    if (dir !== "" && inDir.length < 2) continue;

    let kind: AreaKind = "package";
    const stack: string[] = [];

    if (manifest === "package.json") {
      const pkg = readJson(path.join(root, dir, "package.json"));
      const deps = depsOf(pkg);
      const fe = FRONTEND_DEPS.filter((d) => deps.includes(d));
      if (fe.length) {
        kind = "frontend";
        stack.push(...fe);
      }
      if (deps.includes("vitest")) stack.push("vitest");
      if (deps.includes("jest")) stack.push("jest");
      if (deps.includes("@playwright/test")) stack.push("playwright");
      if (deps.includes("cypress")) stack.push("cypress");
      if (deps.includes("typescript")) stack.push("typescript");
      // A root package.json that only declares workspaces is not an area.
      if (dir === "" && pkg?.workspaces && !fe.length) continue;
    } else if (manifest !== "go.mod" && manifest !== "Cargo.toml") {
      const deps = pyDeps(root, dir);
      if (deps.some((d) => BACKEND_PY.includes(d))) kind = "backend";
      else if (inDir.some((f) => f.endsWith(".py"))) kind = "backend";
      stack.push(...deps);
    } else {
      kind = "package";
      stack.push(manifest === "go.mod" ? "go" : "rust");
    }

    const name = dir === "" ? "root" : dir;
    const existing = seen.get(name);
    if (existing) {
      existing.stack = [...new Set([...existing.stack, ...stack])];
      if (existing.kind === "package" && kind !== "package") existing.kind = kind;
      continue;
    }
    seen.set(name, { name, dir, kind, stack: [...new Set(stack)], files: inDir });
  }

  // Infra is worth naming so agents know to stay out of it.
  const infraFiles = index.files.filter((f) =>
    /(^|\/)(\.gitlab-ci\.yml|Dockerfile|docker-compose|\.github\/workflows|terraform|helm|k8s|charts)(\/|$|\.)/i.test(f),
  );
  if (infraFiles.length) {
    seen.set("infra", { name: "infra", dir: "", kind: "infra", stack: [], files: infraFiles });
  }

  return [...seen.values()].sort((a, b) => b.files.length - a.files.length);
}

// --- tests ----------------------------------------------------------------

const E2E_HINT = /(^|\/)(e2e|end-to-end|integration-tests|playwright|cypress|acceptance)(\/|$)/i;
const INTEGRATION_HINT = /(^|\/)(integration|it|functional)(\/|$)/i;
const PY_TEST = /(^|\/)(tests?)\/|(^|\/)test_[^/]+\.py$|_test\.py$/;
const JS_TEST = /\.(test|spec)\.[jt]sx?$/;

/**
 * The directories the tests actually live in.
 *
 * Uses the real parent directory rather than a fixed depth: the whole value of
 * the test map is that the command is narrow, and "backend/tests" for both the
 * unit and integration suites defeats that.
 */
function topDirs(files: string[]): string[] {
  const s = new Set<string>();
  for (const f of files) {
    const d = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".";
    s.add(d);
  }
  return [...s].sort().slice(0, 6);
}

function detectTests(root: string, index: RepoIndex, areas: Area[]): TestSuite[] {
  const suites: TestSuite[] = [];
  const has = (p: string) => fs.existsSync(path.join(root, p));

  const pyTests = index.files.filter((f) => f.endsWith(".py") && PY_TEST.test(f));
  const jsTests = index.files.filter((f) => JS_TEST.test(f));
  const e2eFiles = index.files.filter(
    (f) => E2E_HINT.test(f) && (JS_TEST.test(f) || f.endsWith(".py") || /\.(cy|e2e)\.[jt]sx?$/.test(f)),
  );

  const pyUnit = pyTests.filter((f) => !E2E_HINT.test(f) && !INTEGRATION_HINT.test(f));
  const pyIntegration = pyTests.filter((f) => INTEGRATION_HINT.test(f));

  if (pyUnit.length) {
    suites.push({
      kind: "unit",
      runner: "pytest",
      command: "pytest <path> -q",
      dirs: topDirs(pyUnit),
      fileCount: pyUnit.length,
    });
  }
  if (pyIntegration.length) {
    suites.push({
      kind: "integration",
      runner: "pytest",
      command: "pytest <path>",
      dirs: topDirs(pyIntegration),
      fileCount: pyIntegration.length,
    });
  }

  const jsUnit = jsTests.filter((f) => !E2E_HINT.test(f));
  if (jsUnit.length) {
    const runner = areas.some((a) => a.stack.includes("vitest"))
      ? "vitest"
      : areas.some((a) => a.stack.includes("jest"))
        ? "jest"
        : "npm test";
    suites.push({
      kind: "unit",
      runner,
      command: runner === "vitest" ? "vitest run <path>" : runner === "jest" ? "jest <path>" : "npm test -- <path>",
      dirs: topDirs(jsUnit),
      fileCount: jsUnit.length,
    });
  }

  const playwright = has("playwright.config.ts") || has("playwright.config.js") || areas.some((a) => a.stack.includes("playwright"));
  const cypress = has("cypress.config.ts") || has("cypress.config.js") || areas.some((a) => a.stack.includes("cypress"));
  if (e2eFiles.length || playwright || cypress) {
    const runner = playwright ? "playwright" : cypress ? "cypress" : "e2e";
    suites.push({
      kind: "e2e",
      runner,
      command: playwright ? "npx playwright test <spec>" : cypress ? "npx cypress run --spec <spec>" : "<e2e command>",
      dirs: topDirs(e2eFiles.length ? e2eFiles : ["e2e"]),
      fileCount: e2eFiles.length,
    });
  }

  return suites;
}

// --- routes, models, components -------------------------------------------

const PY_ROUTE =
  /@(?:app|router|api|bp|blueprint)\s*\.\s*(get|post|put|patch|delete|route)\s*\(\s*["'`]([^"'`]+)/i;
const DJANGO_ROUTE = /\b(?:path|re_path)\s*\(\s*r?["'`]([^"'`]*)["'`]/;
const REACT_ROUTE = /<Route\s[^>]*path\s*=\s*["'{]([^"'}]+)/;
const ROUTER_OBJ = /\bpath\s*:\s*["'`]([^"'`]+)["'`]/;

const PY_MODEL =
  /^\s*class\s+([A-Za-z_]\w*)\s*\(\s*([^)]*\b(?:BaseModel|Base|models\.Model|SQLModel|Document)\b[^)]*)\)/;

function scanFiles(
  root: string,
  files: string[],
  fn: (file: string, line: string, lineNo: number) => void,
  maxBytes = 300_000,
): void {
  for (const f of files) {
    let content: string;
    try {
      const full = path.join(root, f);
      if (fs.statSync(full).size > maxBytes) continue;
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (l.length > 400) continue;
      fn(f, l, i + 1);
    }
  }
}

function detectRoutes(root: string, index: RepoIndex): RouteRef[] {
  const out: RouteRef[] = [];
  const py = index.files.filter((f) => f.endsWith(".py"));
  scanFiles(root, py, (file, line, no) => {
    const m = PY_ROUTE.exec(line);
    if (m) {
      out.push({ method: (m[1] ?? "route").toUpperCase(), path: m[2] ?? "", file, line: no });
      return;
    }
    if (/urls?\.py$/.test(file)) {
      const d = DJANGO_ROUTE.exec(line);
      if (d?.[1] !== undefined) out.push({ method: "PATH", path: d[1], file, line: no });
    }
  });

  const jsx = index.files.filter((f) => /\.[jt]sx?$/.test(f));
  scanFiles(root, jsx, (file, line, no) => {
    const m = REACT_ROUTE.exec(line);
    if (m?.[1]) {
      out.push({ method: "PAGE", path: m[1], file, line: no });
      return;
    }
    if (/rout(e|er)/i.test(file)) {
      const o = ROUTER_OBJ.exec(line);
      if (o?.[1] && o[1].startsWith("/")) out.push({ method: "PAGE", path: o[1], file, line: no });
    }
  });

  return out.slice(0, 400);
}

function detectModels(root: string, index: RepoIndex): ModelRef[] {
  const out: ModelRef[] = [];
  const py = index.files.filter((f) => f.endsWith(".py"));
  scanFiles(root, py, (file, line, no) => {
    const m = PY_MODEL.exec(line);
    if (m?.[1]) {
      const bases = m[2] ?? "";
      const kind = /BaseModel|SQLModel/.test(bases)
        ? "pydantic"
        : /models\.Model/.test(bases)
          ? "django"
          : "orm";
      out.push({ name: m[1], kind, file, line: no });
    }
  });
  return out.slice(0, 300);
}

function detectComponents(index: RepoIndex): ComponentRef[] {
  // A PascalCase definition in a .tsx/.jsx file is a component by convention.
  const isView = (f: string) => /\.[jt]sx$/.test(f);
  return index.symbols
    .filter(
      (s: SymbolRef) =>
        isView(s.file) &&
        /^[A-Z][A-Za-z0-9]*$/.test(s.name) &&
        (s.kind === "function" || s.kind === "const" || s.kind === "class"),
    )
    .slice(0, 400)
    .map((s) => ({ name: s.name, file: s.file, line: s.line }));
}

// --- entry point ----------------------------------------------------------

export function analyzeProject(root: string): Project {
  const index = buildIndex(root);
  const areas = detectAreas(root, index);
  const tests = detectTests(root, index, areas);
  const routes = detectRoutes(root, index);
  const models = detectModels(root, index);
  const components = detectComponents(index);

  const unknowns: string[] = [];
  if (!tests.length) unknowns.push("No test suites detected — add the verification commands by hand.");
  if (!tests.some((t) => t.kind === "e2e")) {
    unknowns.push("No E2E suite detected. If one exists, add it and its wall-clock cost.");
  } else {
    unknowns.push("E2E wall-clock cost is unknown — measure one full run and record it, since it decides how strictly to ration E2E.");
  }
  unknowns.push("Flaky tests are not detectable from source. List any known flaky specs so agents do not chase them.");
  if (!routes.length) unknowns.push("No HTTP routes detected — the route table may need filling in by hand.");

  return {
    root,
    name: index.name,
    index,
    areas,
    tests,
    routes,
    models,
    components,
    conventions: index.conventions,
    offLimits: index.offLimits,
    unknowns,
  };
}
