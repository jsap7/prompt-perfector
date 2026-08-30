import { analyze, score, lint } from "./lint.js";
import { perfect, type PerfectOptions } from "./perfect.js";
import { render, scorableText } from "./render.js";
import { findRepo, type Config } from "./config.js";
import { record } from "./history.js";
import { extractOffline } from "./extract.js";
import type { Result, PerfectedPrompt } from "./types.js";
import type { FileMatch, RepoContext } from "./repo.js";

export async function runPipeline(
  raw: string,
  config: Config,
  refine?: { previous: PerfectedPrompt; instruction: string },
): Promise<Result> {
  const analysis = analyze(raw, config.perAcu);
  const repo = findRepo(config, raw);

  const opts: PerfectOptions = { config, repo, refine };
  const { perfected, usage } = await perfect(raw, opts);

  const rendered = render(perfected);
  const after = score(lint(scorableText(rendered)), config.perAcu);

  record({
    at: new Date().toISOString(),
    raw,
    rendered,
    title: perfected.title,
    repo: perfected.repo,
    objective: perfected.objective,
    filesInScope: perfected.filesInScope,
    steps: perfected.steps,
    verification: perfected.verification,
    scoreBefore: analysis.before.score,
    scoreAfter: after.score,
    savedAcuLow: Math.max(0, analysis.before.acuLow - after.acuLow),
    savedAcuHigh: Math.max(0, analysis.before.acuHigh - after.acuHigh),
  });

  return { analysis, perfected, after, rendered, usage };
}


export interface OfflineRun extends Result {
  resolved: FileMatch[];
  repo: RepoContext;
}

/** Deterministic build. No API call, no credentials, no network. */
export function runOffline(raw: string, config: Config): OfflineRun {
  const analysis = analyze(raw, config.perAcu);
  const { perfected, resolved, repo } = extractOffline(raw, config);
  const rendered = render(perfected);
  const after = score(lint(scorableText(rendered)), config.perAcu);

  record({
    at: new Date().toISOString(),
    raw,
    rendered,
    title: perfected.title,
    repo: perfected.repo,
    objective: perfected.objective,
    filesInScope: perfected.filesInScope,
    steps: perfected.steps,
    verification: perfected.verification,
    scoreBefore: analysis.before.score,
    scoreAfter: after.score,
    savedAcuLow: Math.max(0, analysis.before.acuLow - after.acuLow),
    savedAcuHigh: Math.max(0, analysis.before.acuHigh - after.acuHigh),
  });

  return { analysis, perfected, after, rendered, resolved, repo };
}
