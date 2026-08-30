import { analyze, score, lint } from "./lint.js";
import { perfect, type PerfectOptions } from "./perfect.js";
import { render, scorableText } from "./render.js";
import { findRepo, type Config } from "./config.js";
import { record } from "./history.js";
import type { Result, PerfectedPrompt } from "./types.js";

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
    scoreBefore: analysis.before.score,
    scoreAfter: after.score,
    savedAcuLow: Math.max(0, analysis.before.acuLow - after.acuLow),
    savedAcuHigh: Math.max(0, analysis.before.acuHigh - after.acuHigh),
  });

  return { analysis, perfected, after, rendered, usage };
}
