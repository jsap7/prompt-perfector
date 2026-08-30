import { z } from "zod";

/**
 * The work item contract.
 *
 * A GitLab work item an agent can execute is the same artifact as a PP prompt
 * with a different wrapper. Defining the contract once means the creator and
 * the scoping gate share a rule set: one writes it, the other checks it, and
 * "is this ready for an agent?" stops being a judgement call.
 */

export const WorkItemSchema = z.object({
  title: z.string().describe("Imperative, under ten words. What changes, not why."),
  area: z
    .string()
    .nullable()
    .describe("Which part of the codebase, e.g. 'backend/payments'. Null if not stated."),
  objective: z
    .string()
    .describe("One sentence naming the concrete change. Not the motivation."),
  filesInScope: z
    .array(z.string())
    .describe("Only paths actually supplied. Never guess one."),
  steps: z.array(z.string()).describe("Ordered, discrete, imperative actions."),
  constraints: z
    .array(z.string())
    .describe("Patterns to follow, things to leave unchanged."),
  outOfScope: z
    .array(z.string())
    .describe("Concrete prohibitions tied to this task. At least two."),
  acceptance: z
    .array(z.string())
    .describe("Observable, checkable statements of done."),
  verification: z
    .array(z.string())
    .describe(
      "Runnable shell commands only, e.g. 'pytest tests/unit/api -q'. Never a prose description of a check — if no command is known, leave this empty and ask for one in openQuestions.",
    ),
  openQuestions: z
    .array(z.string())
    .describe("Facts you could not determine, each phrased as a direct question."),
  labels: z.array(z.string()).describe("Short GitLab labels, e.g. 'backend', 'bug'."),
  estimate: z
    .enum(["XS", "S", "M", "L", "XL"])
    .describe("XS/S are agent-friendly. L/XL should be split before starting."),
  splitSuggestion: z
    .array(z.string())
    .describe("If L or XL, the smaller items it should become. Otherwise empty."),
});

export type WorkItem = z.infer<typeof WorkItemSchema>;

// --- readiness ------------------------------------------------------------

export type Blocker = { field: string; why: string };

export interface Readiness {
  ready: boolean;
  score: number;
  blockers: Blocker[];
  warnings: Blocker[];
}

/**
 * Mechanical readiness check.
 *
 * Deliberately not a model call — these are structural facts about the item,
 * and a rule that can be checked in code should never cost a token. The gate
 * agent adds judgement on top of this, it does not replace it.
 */
export function checkReadiness(item: WorkItem): Readiness {
  const blockers: Blocker[] = [];
  const warnings: Blocker[] = [];

  if (item.openQuestions.length) {
    blockers.push({
      field: "openQuestions",
      why: `${item.openQuestions.length} unanswered question${item.openQuestions.length === 1 ? "" : "s"}. An agent will either guess or go looking — both cost more than answering now.`,
    });
  }
  if (!item.filesInScope.length) {
    blockers.push({
      field: "filesInScope",
      why: "No files named. The agent's first move becomes a repo search.",
    });
  }
  if (!item.acceptance.length) {
    blockers.push({
      field: "acceptance",
      why: "Nothing defines done, so the agent keeps going and gold-plates.",
    });
  }
  if (!item.verification.length) {
    blockers.push({
      field: "verification",
      why: "No verification command, so the agent picks its own — often the full suite, repeatedly.",
    });
  }
  if (item.estimate === "L" || item.estimate === "XL") {
    blockers.push({
      field: "estimate",
      why: `Estimated ${item.estimate}. Large sessions are where work goes wrong; split it first.`,
    });
  }

  if (item.outOfScope.length < 2) {
    warnings.push({
      field: "outOfScope",
      why: "Few prohibitions. Thoroughness is the default failure mode — forbid the adjacent work explicitly.",
    });
  }
  if (!item.steps.length) {
    warnings.push({
      field: "steps",
      why: "No ordered steps. Fine for a one-line change, weak for anything else.",
    });
  }
  if (!item.area) {
    warnings.push({
      field: "area",
      why: "No area named, so the agent cannot be pointed at the right map chunk.",
    });
  }

  const total = 5;
  const score = Math.round(((total - blockers.length) / total) * 100);
  return { ready: blockers.length === 0, score, blockers, warnings };
}

// --- rendering ------------------------------------------------------------

const section = (h: string, items: string[], ordered = false) =>
  items.length
    ? `## ${h}\n${items.map((s, i) => (ordered ? `${i + 1}. ${s}` : `- ${s}`)).join("\n")}\n`
    : "";

/** GitLab-flavoured markdown, ready to paste into a work item description. */
export function renderWorkItem(item: WorkItem): string {
  const parts = [
    `## Objective\n${item.objective}\n`,
    item.area ? `**Area:** \`${item.area}\`  ·  **Size:** ${item.estimate}\n` : `**Size:** ${item.estimate}\n`,
    section("Files in scope", item.filesInScope.map((f) => `\`${f}\``)),
    section("Steps", item.steps, true),
    section("Constraints", item.constraints),
    section("Do NOT", item.outOfScope),
    section("Done when", item.acceptance),
    section("Verify with", item.verification.map((v) => `\`${v}\``)),
  ];

  if (item.openQuestions.length) {
    parts.push(
      `## Open questions — answer before assigning\n` +
        item.openQuestions.map((q) => `- [ ] ${q}`).join("\n") +
        `\n\n_An agent picking this up should ask rather than explore the repo._\n`,
    );
  }

  if (item.splitSuggestion.length) {
    parts.push(
      `## Suggested split\n` +
        `This is ${item.estimate}. Consider separate items:\n` +
        item.splitSuggestion.map((s) => `- ${s}`).join("\n") +
        `\n`,
    );
  }

  parts.push(
    `## Agent rules\n` +
      `- Do not modify files outside those listed above.\n` +
      `- If a required detail is missing, stop and ask — do not explore to resolve it.\n` +
      `- Follow the test discipline in \`.agents/map/tests.md\`.\n` +
      `- Stop once the acceptance criteria are met and verification passes.\n`,
  );

  return parts.filter(Boolean).join("\n").trimEnd() + "\n";
}
