import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Config } from "./config.js";
import { WorkItemSchema, type WorkItem } from "./workItem.js";
import { pickRepo, resolveAgainstIndex, type RepoIndex } from "./repoIndex.js";

/**
 * Issue creator and scoping gate.
 *
 * Both run on a small model on purpose. Turning a feature description into a
 * structured work item is extraction and formatting, not reasoning, and
 * routing cheap tasks to expensive models by default is where most overspend
 * comes from. The expensive model earns its place executing the work, not
 * filling in a template.
 */

const CREATE_SYSTEM = `You turn a feature request into a GitLab work item that an autonomous coding agent can execute without asking follow-up questions.

The agent that picks this up bills by wall-clock time, not tokens. So the cost of a vague work item is not a longer prompt — it is the agent searching the repository for a file you did not name, weighing a design decision you did not make, or running a full test suite you did not scope. Your job is to remove every reason for it to search.

Rules, in priority order:

1. NEVER INVENT A PATH, COMMAND, SYMBOL, OR ENDPOINT. If it was not supplied, it goes in "openQuestions" as a direct question. A wrong path is worse than a missing one: the agent hunts for a file that does not exist, then improvises. This rule outranks completeness — an item with four open questions and no invented facts is far more useful than a complete-looking fiction.

2. DECIDE NOTHING THAT BELONGS TO THE REQUESTER. If the request defers a design choice, surface it as an open question. Do not quietly pick one.

3. FILL "outOfScope" AGGRESSIVELY. This is the highest-leverage field. An agent's default is thoroughness, and thoroughness is what costs. Forbid the specific adjacent work this task invites — unrelated refactors, drive-by formatting, dependency bumps, touching neighbouring modules, broadening tests. Tie each prohibition to this task; do not write generic boilerplate. Always produce at least two.

4. ESTIMATE HONESTLY. XS and S are agent-friendly. If the work is genuinely L or XL, say so and populate "splitSuggestion" with the smaller items it should become. Large sessions are where agent work goes wrong.

5. VERIFICATION MEANS A RUNNABLE COMMAND. "verification" holds shell commands and nothing else, such as "pytest tests/unit/api -q" or "npm test -- search". A prose description of a check ("confirm the endpoint returns 429") is not a command; that belongs in "acceptance". If no command is known, leave verification empty and ask for one in openQuestions. Prefer a single test path or filter over a whole suite.

6. ADD NO WORK. Structure the request; never expand it.

Write for an agent: imperative, specific, no motivation unless it changes what correct means.`;

function repoBlock(idx: RepoIndex | null, text: string): string {
  if (!idx) return "(no indexed repository — do not guess paths)";
  const matches = resolveAgainstIndex(text, idx, 8);
  const lines = [
    `Repository: ${idx.name}`,
    idx.testCommand ? `Test command: ${idx.testCommand}` : "",
    idx.conventions.length ? `Conventions:\n${idx.conventions.map((c) => `- ${c}`).join("\n")}` : "",
    idx.offLimits.length ? `Never modify: ${idx.offLimits.join(", ")}` : "",
  ].filter(Boolean);

  if (matches.length) {
    lines.push(
      `Files in this repo that appear related (verified to exist — you may use these):\n` +
        matches
          .map(
            (m) =>
              `- ${m.path}${m.symbol ? ` (${m.symbol.name} at line ${m.symbol.line})` : ""}`,
          )
          .join("\n"),
    );
  }
  return lines.join("\n");
}

const IN = 1 / 1_000_000;
const OUT = 5 / 1_000_000;

export interface IssueResult {
  item: WorkItem;
  costUsd: number;
  repoName: string | null;
}

export async function createWorkItem(
  request: string,
  config: Config,
  modelOverride?: string,
): Promise<IssueResult> {
  const client = new Anthropic();
  const idx = pickRepo(request);
  const model = modelOverride ?? config.smallModel ?? "claude-haiku-4-5";

  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    system: [{ type: "text", text: CREATE_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { format: zodOutputFormat(WorkItemSchema) },
    messages: [
      {
        role: "user",
        content: `Project context:\n${repoBlock(idx, request)}\n\nFeature request:\n"""\n${request.trim()}\n"""`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Model did not return a parseable work item.");

  const u = response.usage;
  return {
    item: parsed as WorkItem,
    costUsd: u.input_tokens * IN + u.output_tokens * OUT,
    repoName: idx?.name ?? null,
  };
}

// --- scoping gate ---------------------------------------------------------

const GateSchema = z.object({
  verdict: z
    .enum(["ready", "needs-work", "too-big"])
    .describe("ready = an agent can start now."),
  reasoning: z.string().describe("One or two sentences. What decided the verdict."),
  questions: z
    .array(z.string())
    .describe("What must be answered before an agent starts. Empty if ready."),
  risks: z
    .array(z.string())
    .describe("Ways this could go expensive: scope creep, ambiguity, wide blast radius."),
  suggestedSplit: z
    .array(z.string())
    .describe("If too-big, the smaller items it should become."),
});

export type GateVerdict = z.infer<typeof GateSchema>;

const GATE_SYSTEM = `You are a scoping gate. You decide whether a work item is ready for an autonomous coding agent to pick up.

This runs immediately before the most expensive step in the pipeline. The agent bills by wall-clock time, so an ambiguous item does not produce a slightly worse result — it produces an agent reading the repository, guessing at decisions, and running suites it did not need. Catching that here costs a fraction of a cent.

Judge only these things:

1. Could an agent start work right now without asking anything? If not, list precisely what it would have to ask.
2. Is the scope bounded? Named files, explicit prohibitions, a clear stopping point.
3. Is it small enough for one session? Several unrelated changes bundled together should be split — later work in a session pays to re-read the context of earlier work.
4. Is "done" observable, and is there a command that proves it?

Be strict about missing file paths, undecided design choices, and absent verification commands. Those three are what actually burn budget.

Be equally careful not to manufacture objections. An item that is genuinely small, specific, and verifiable is "ready" — say so plainly and return no questions. A gate that never passes anything gets ignored, and then it protects nothing.`;

export interface GateResult {
  verdict: GateVerdict;
  costUsd: number;
}

export async function scopeGate(
  itemText: string,
  config: Config,
  modelOverride?: string,
): Promise<GateResult> {
  const client = new Anthropic();
  const model = modelOverride ?? config.smallModel ?? "claude-haiku-4-5";

  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: [{ type: "text", text: GATE_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { format: zodOutputFormat(GateSchema) },
    messages: [
      { role: "user", content: `Work item:\n"""\n${itemText.trim()}\n"""` },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Model did not return a parseable verdict.");

  const u = response.usage;
  return {
    verdict: parsed as GateVerdict,
    costUsd: u.input_tokens * IN + u.output_tokens * OUT,
  };
}
