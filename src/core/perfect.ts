import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Config, RepoProfile } from "./config.js";
import type { PerfectedPrompt } from "./types.js";

const PerfectedSchema = z.object({
  title: z.string().describe("Six words or fewer naming the task."),
  repo: z.string().nullable().describe("Repository name if stated or inferable, else null."),
  objective: z.string().describe("One sentence. The concrete change, not the motivation."),
  filesInScope: z
    .array(z.string())
    .describe("Only paths/symbols the user actually named. Never invent one."),
  steps: z.array(z.string()).describe("Ordered, discrete, imperative actions."),
  constraints: z.array(z.string()).describe("Patterns to follow, libraries to reuse, things to keep unchanged."),
  outOfScope: z
    .array(z.string())
    .describe("Explicit DO NOTs that stop Devin wandering. Always at least two."),
  acceptance: z.array(z.string()).describe("Observable, checkable statements of done."),
  verification: z.array(z.string()).describe("Narrowest commands that prove it works."),
  gaps: z
    .array(z.string())
    .describe("Facts you could not determine, phrased as a direct question to the user."),
  splitOut: z.array(z.string()).describe("Unrelated asks that belong in their own Devin session."),
  notes: z.array(z.string()).describe("At most two short notes on what you changed and why."),
});

const SYSTEM = `You rewrite spoken engineering requests into Devin session prompts.

Devin is Cognition's autonomous coding agent. It bills in ACUs — Agent Compute Units — where roughly one ACU is fifteen minutes of active agent work, costing about $2.25. Critically, ACUs bill the agent's wall-clock time, not tokens. That means the expensive thing is never the code Devin writes. The expensive thing is Devin *reading*: scanning a repo to find a file the prompt didn't name, weighing design options the prompt didn't decide, re-running a full test suite the prompt didn't scope, or chasing an open-ended "and anything else you notice".

Your job is to remove every reason for Devin to search.

Your input is raw voice dictation. It will ramble, restart, contain filler, and bury the actual request in the middle. Read it charitably and completely — the user knows their codebase, and offhand details ("it's the one that wraps the retry logic") are real technical content, not noise.

Rules, in priority order:

1. NEVER INVENT SPECIFICS. Do not fabricate file paths, function names, commands, table names, or endpoints. If the user did not give it and you cannot infer it from the provided repo profile, it goes in "gaps" as a direct question. A gap the user answers in five seconds costs nothing; the same fact discovered by Devin costs real money. Fabricating a path is the worst possible outcome — Devin burns ACUs looking for a file that does not exist, then improvises.

2. DECIDE NOTHING THAT IS THEIRS TO DECIDE. If the dictation defers a design choice ("whatever you think is cleanest"), do not silently pick one. Surface it in "gaps". If the choice is genuinely trivial and reversible, pick it and say so in "notes".

3. FILL "outOfScope" AGGRESSIVELY. This is the highest-leverage field. Devin's default is thoroughness, and thoroughness is what costs money. Forbid the specific adjacent work this task invites: unrelated refactors, drive-by formatting, dependency upgrades, touching files outside the list, broadening test coverage, "improving" things it passes on the way. Write these as concrete prohibitions tied to this task, not generic boilerplate. Always produce at least two.

4. SCOPE VERIFICATION NARROWLY. Prefer a single test file or a filter over a whole suite. If a full run is warranted, say to do it once at the end rather than per iteration. If no command is known, put it in "gaps" — do not guess a command.

5. PRESERVE EVERY TECHNICAL CONSTRAINT the user stated, even in passing. Dropping one causes rework, and rework is a second session.

6. ADD NO WORK. You tighten and structure; you never expand the ask. If the user asked for one thing, the prompt asks for one thing.

7. SPLIT UNRELATED ASKS. Cognition recommends one session per task; bundled work makes later steps pay to re-read earlier context. Keep the primary ask, and list the others in "splitOut" verbatim enough that the user can paste them into PP again later.

8. WRITE FOR AN AGENT. Direct, imperative, unambiguous. No hedging, no pleasantries, no explanation of why the task matters unless that motivation changes what correct means.

Keep "notes" to at most two short lines — what you cut and what you need. It is read by a human in a hurry.`;

function repoBlock(repo: RepoProfile | null, cfg: Config): string {
  const lines: string[] = [];
  if (repo) {
    lines.push(`Repository: ${repo.name}`);
    if (repo.testCommand) lines.push(`Verification command for this repo: ${repo.testCommand}`);
    if (repo.conventions?.length)
      lines.push(`Conventions:\n${repo.conventions.map((c) => `- ${c}`).join("\n")}`);
    if (repo.offLimits?.length)
      lines.push(`Never touch: ${repo.offLimits.join(", ")}`);
  }
  if (cfg.standingConstraints.length) {
    lines.push(
      `Standing constraints (fold into "constraints" or "outOfScope" as appropriate):\n${cfg.standingConstraints
        .map((c) => `- ${c}`)
        .join("\n")}`,
    );
  }
  return lines.length ? lines.join("\n") : "(no repo profile configured)";
}

export interface PerfectOptions {
  config: Config;
  repo: RepoProfile | null;
  /** Prior result plus user instruction, for the refine loop. */
  refine?: { previous: PerfectedPrompt; instruction: string };
}

export interface PerfectOutput {
  perfected: PerfectedPrompt;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

// Claude Opus 5: $5 / 1M input, $25 / 1M output.
const IN_PER_TOKEN = 5 / 1_000_000;
const OUT_PER_TOKEN = 25 / 1_000_000;

export async function perfect(
  raw: string,
  opts: PerfectOptions,
): Promise<PerfectOutput> {
  const client = new Anthropic();
  const { config, repo, refine } = opts;

  const userContent = refine
    ? [
        `Project context:\n${repoBlock(repo, config)}`,
        `Original dictation:\n"""\n${raw.trim()}\n"""`,
        `The prompt you produced last time:\n${JSON.stringify(refine.previous, null, 2)}`,
        `The user wants this changed:\n"""\n${refine.instruction.trim()}\n"""`,
        `Produce the full revised prompt. Keep everything the user did not ask you to change.`,
      ].join("\n\n")
    : [
        `Project context:\n${repoBlock(repo, config)}`,
        `Raw dictation to convert:\n"""\n${raw.trim()}\n"""`,
      ].join("\n\n");

  const response = await client.messages.parse({
    model: config.model,
    max_tokens: 8000,
    // Stable prefix — cached so repeated runs only pay for the dictation.
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: config.effort,
      format: zodOutputFormat(PerfectedSchema),
    },
    messages: [{ role: "user", content: userContent }],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Model did not return a parseable prompt. Try again.");
  }

  const u = response.usage;
  return {
    perfected: parsed as PerfectedPrompt,
    usage: {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      costUsd:
        u.input_tokens * IN_PER_TOKEN + u.output_tokens * OUT_PER_TOKEN,
    },
  };
}
