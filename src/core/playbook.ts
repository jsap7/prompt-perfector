import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Config } from "./config.js";
import { readAll, type HistoryEntry } from "./history.js";

/**
 * Playbooks are the one automation rung that is purely defensive: they cut
 * per-session cost without increasing session volume. The practical trigger
 * for writing one is repetition — if the same task shape has been prompted
 * three times, the fourth should be a macro.
 *
 * PP already has the evidence. Every perfected prompt is stored, so the
 * repeated shapes can be found rather than remembered.
 */

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "in", "of", "for", "on", "with", "at",
  "from", "by", "so", "that", "this", "it", "is", "are", "was", "be", "as",
  "into", "then", "when", "if", "do", "not", "run", "add", "update", "change",
  "make", "use", "using", "new", "our", "we", "i", "you", "should", "must",
]);

function tokens(e: HistoryEntry): Set<string> {
  const text = [
    e.title ?? "",
    e.objective ?? "",
    (e.verification ?? []).join(" "),
    // File extensions capture the shape of the work without pinning to one file.
    (e.filesInScope ?? [])
      .map((f) => f.split(".").pop() ?? "")
      .join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return new Set(
    text
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface Cluster {
  members: HistoryEntry[];
  /** Words common to the whole cluster — what makes it a shape. */
  signature: string[];
}

const SIMILAR = 0.28;

export function findClusters(minSize = 3): Cluster[] {
  return clusterEntries(readAll(), minSize);
}

/** Pure clustering over supplied rows, so it can be tested without touching ~/.pp. */
export function clusterEntries(all: HistoryEntry[], minSize = 3): Cluster[] {
  // Only rows carrying structured fields can be compared meaningfully.
  const rows = all.filter((e) => e.title || e.objective);
  const toks = rows.map(tokens);
  const used = new Array(rows.length).fill(false);
  const clusters: Cluster[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (used[i]) continue;
    const group = [i];
    for (let j = i + 1; j < rows.length; j++) {
      if (used[j]) continue;
      if (jaccard(toks[i]!, toks[j]!) >= SIMILAR) {
        group.push(j);
        used[j] = true;
      }
    }
    used[i] = true;
    if (group.length < minSize) continue;

    let common = new Set(toks[group[0]!]!);
    for (const k of group.slice(1)) {
      common = new Set([...common].filter((t) => toks[k]!.has(t)));
    }

    clusters.push({
      members: group.map((k) => rows[k]!),
      signature: [...common].slice(0, 8),
    });
  }

  return clusters.sort((a, b) => b.members.length - a.members.length);
}

const PlaybookSchema = z.object({
  title: z.string().describe("Short imperative name, e.g. 'Upgrade a dependency'."),
  whenToUse: z.string().describe("One sentence: the trigger for running this playbook."),
  procedure: z.array(z.string()).describe("Ordered, generalized steps. Use {{PLACEHOLDER}} for per-run values."),
  inputs: z.array(z.string()).describe("The {{PLACEHOLDER}} values the operator supplies each run."),
  specifications: z.array(z.string()).describe("Constraints and conventions that always apply."),
  forbidden: z.array(z.string()).describe("Explicit DO NOTs that keep the session bounded."),
  verification: z.array(z.string()).describe("Narrowest commands proving the run succeeded."),
  notes: z.array(z.string()).describe("At most two notes on what was generalized away."),
});

export type Playbook = z.infer<typeof PlaybookSchema>;

const SYSTEM = `You write Devin Playbooks.

A Playbook is a reusable procedure for a task shape a team repeats. It converts an exploratory session into a scripted one, which is the point: Devin bills roughly one ACU per fifteen minutes of active work, and most of that is spent rediscovering a procedure someone already knows.

You are given several real prompts the same team already ran for the same kind of task. Generalize them into one procedure.

Rules:

1. GENERALIZE, DO NOT AVERAGE. Find the shared procedure. Anything that varied between runs becomes a {{PLACEHOLDER}} listed in "inputs" — file paths, package names, ticket ids, version numbers.

2. INVENT NOTHING. Every step must be traceable to something in the supplied examples. If the examples disagree on a detail, make it an input rather than picking one.

3. KEEP IT BOUNDED. "forbidden" is what stops a scripted session becoming an exploratory one. Carry over the DO NOTs from the examples and add any the shape obviously invites. Always produce at least two.

4. SCOPE VERIFICATION NARROWLY. Prefer the targeted command the examples used over a full suite.

5. PREFER STOPPING TO GUESSING. If an input is missing at run time, the procedure should say to ask, not to search the repository for it.

Write for an agent: imperative, specific, no motivation or preamble.`;

export async function draftPlaybook(
  cluster: Cluster,
  config: Config,
): Promise<{ playbook: Playbook; costUsd: number }> {
  const client = new Anthropic();

  const examples = cluster.members
    .map((m, i) =>
      [
        `### Example ${i + 1} (${m.at.slice(0, 10)})`,
        m.rendered,
      ].join("\n"),
    )
    .join("\n\n");

  const response = await client.messages.parse({
    model: config.model,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: config.effort,
      format: zodOutputFormat(PlaybookSchema),
    },
    messages: [
      {
        role: "user",
        content: `The team ran these ${cluster.members.length} prompts for what appears to be the same task shape. Generalize them into one Playbook.\n\n${examples}`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Model did not return a parseable playbook.");

  const u = response.usage;
  return {
    playbook: parsed as Playbook,
    costUsd: (u.input_tokens * 5 + u.output_tokens * 25) / 1_000_000,
  };
}

export function renderPlaybook(p: Playbook): string {
  const list = (h: string, items: string[], ordered = false) =>
    items.length
      ? `## ${h}\n${items
          .map((s, i) => (ordered ? `${i + 1}. ${s}` : `- ${s}`))
          .join("\n")}\n`
      : "";

  return [
    `# ${p.title}`,
    "",
    `**When to use:** ${p.whenToUse}`,
    "",
    list("Inputs", p.inputs),
    list("Procedure", p.procedure, true),
    list("Specifications", p.specifications),
    list("Do NOT", p.forbidden),
    list("Verification", p.verification),
    "## Stop conditions",
    "- If an input above is missing, ask for it. Do not search the repository to infer it.",
    "- Do not expand scope beyond this procedure.",
    "- Stop once verification passes.",
    "",
    p.notes.length ? `---\n${p.notes.map((n) => `_${n}_`).join("\n")}\n` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
