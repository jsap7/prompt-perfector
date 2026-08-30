import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Config } from "./config.js";

/**
 * CI failure triage.
 *
 * Classify before spending. A pipeline failure routed straight to an expensive
 * agent is a bet that the failure is real and worth fixing; often it is an
 * infrastructure blip or a known-flaky test, and the agent spends real money
 * discovering that — or worse, "fixes" a test that was never broken.
 *
 * This deliberately ends at a summary, not a fix. Investigation is the
 * expensive part and the decision is the risky part, so automating the first
 * while keeping a human on the second captures most of the saving with little
 * of the risk.
 */

const TriageSchema = z.object({
  category: z
    .enum(["real", "flaky", "environment", "unclear"])
    .describe("real = a genuine defect in the change under test."),
  confidence: z.enum(["high", "medium", "low"]),
  summary: z.string().describe("One or two sentences: what failed and why."),
  evidence: z
    .array(z.string())
    .describe("Specific lines or signals from the log that decided it."),
  suspectFiles: z
    .array(z.string())
    .describe("Paths named in the log itself. Never invent one."),
  suggestedAction: z
    .enum(["assign-agent", "retry", "fix-infrastructure", "ask-human"])
    .describe("What should happen next."),
  agentPrompt: z
    .string()
    .nullable()
    .describe("If assign-agent, a scoped prompt. Otherwise null."),
});

export type Triage = z.infer<typeof TriageSchema>;

const SYSTEM = `You triage CI pipeline failures. You classify; you do not fix.

You run before anything expensive is dispatched. An autonomous coding agent bills by wall-clock time, so sending it at a failure that turned out to be an infrastructure blip or a known-flaky test wastes real money — and an agent pointed at a flaky test will sometimes "fix" the test rather than the code, which is worse than doing nothing.

Categories:

- **real** — the failure is caused by the change under test. Assertion failures, type errors, genuine regressions, newly broken behaviour.
- **flaky** — the failure is nondeterministic and unrelated to the change. Timeouts, race conditions, timing sensitivity, ordering dependence, network calls to third parties, tests that pass on retry.
- **environment** — infrastructure, not code. Runner out of disk, dependency registry unreachable, container pull failure, expired credentials, missing service, OOM kills.
- **unclear** — the log genuinely does not contain enough to tell. Use this rather than guessing; a confident wrong classification is worse than an honest "unclear".

Rules:

1. NEVER INVENT A FILE PATH. Only cite paths that appear in the log itself.
2. Prefer "unclear" with low confidence over a confident guess. The cost of a wrong "real" is an agent dispatched at nothing.
3. Only recommend assign-agent when the category is "real" AND the log names enough for an agent to start without searching. Otherwise recommend ask-human.
4. When you do write an agentPrompt, scope it hard: the failing test, the named files, the narrowest command to reproduce, and explicit instructions not to touch anything else.

   Two things the prompt must never do. It must never offer the agent a choice of fix ("either change the signature or change the test") — a deferred decision is the single most expensive thing you can hand an agent, because it explores the alternatives before writing anything. If the log does not make the correct fix unambiguous, the category is still "real" but the action is ask-human and agentPrompt is null.

   And it must never permit editing the test to make it pass. Say explicitly: fix the source, not the test; if the test itself looks wrong, stop and report that instead of changing it. An agent that weakens a test to go green has done worse than nothing.
5. Quote actual log lines as evidence. A classification without evidence is a guess.`;

const IN = 1 / 1_000_000;
const OUT = 5 / 1_000_000;

export interface TriageResult {
  triage: Triage;
  costUsd: number;
}

/** Logs are long and the signal clusters at the end. Keep both ends. */
export function trimLog(log: string, maxChars = 24_000): string {
  const t = log.trim();
  if (t.length <= maxChars) return t;
  const head = Math.floor(maxChars * 0.25);
  const tail = maxChars - head;
  return (
    t.slice(0, head) +
    `\n\n... [${t.length - maxChars} characters trimmed from the middle] ...\n\n` +
    t.slice(-tail)
  );
}

export async function triageFailure(
  log: string,
  config: Config,
  opts: { knownFlaky?: string[]; modelOverride?: string } = {},
): Promise<TriageResult> {
  const client = new Anthropic();
  const model = opts.modelOverride ?? config.smallModel ?? "claude-haiku-4-5";

  const flakyBlock = opts.knownFlaky?.length
    ? `Known flaky tests in this repo — a failure matching one of these is almost certainly "flaky":\n${opts.knownFlaky.map((f) => `- ${f}`).join("\n")}\n\n`
    : "";

  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { format: zodOutputFormat(TriageSchema) },
    messages: [
      {
        role: "user",
        content: `${flakyBlock}CI failure log:\n"""\n${trimLog(log)}\n"""`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Model did not return a parseable triage.");

  const u = response.usage;
  return {
    triage: parsed as Triage,
    costUsd: u.input_tokens * IN + u.output_tokens * OUT,
  };
}

/** Read the flaky table out of a generated .agents/map/tests.md. */
export function readKnownFlaky(testsMap: string): string[] {
  const section = testsMap.split(/^## Known flaky tests/m)[1];
  if (!section) return [];
  const rows = section.split(/^## /m)[0] ?? "";
  return rows
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => l.split("|")[1]?.trim() ?? "")
    .filter((c) => c && !/^-+$/.test(c) && c.toLowerCase() !== "test");
}
