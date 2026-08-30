import type { PerfectedPrompt } from "./types.js";

const section = (heading: string, items: string[], ordered = false): string => {
  if (!items.length) return "";
  const body = ordered
    ? items.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : items.map((s) => `- ${s}`).join("\n");
  return `## ${heading}\n${body}\n`;
};

/**
 * Render the prompt that actually gets pasted into Devin.
 *
 * Unresolved gaps are deliberately rendered as a stop-and-ask instruction
 * rather than omitted. An unknown Devin knows to ask about costs one message;
 * an unknown it doesn't know about costs a repo search.
 */
export function render(p: PerfectedPrompt): string {
  const parts: string[] = [];

  parts.push(`# ${p.title}\n`);
  if (p.repo) parts.push(`Repo: ${p.repo}\n`);

  parts.push(`## Objective\n${p.objective}\n`);

  parts.push(section("Files in scope", p.filesInScope));
  parts.push(section("Steps", p.steps, true));
  parts.push(section("Constraints", p.constraints));
  parts.push(section("Do NOT", p.outOfScope));
  parts.push(section("Done when", p.acceptance));
  parts.push(section("Verify with", p.verification));

  if (p.gaps.length) {
    parts.push(
      section(
        "Unresolved — stop and ask, do not go looking",
        p.gaps.map(
          (g) => `${g} Ask me directly rather than searching the repo for it.`,
        ),
      ),
    );
  }

  parts.push(
    `## Stop conditions\n` +
      `- Do not expand scope beyond the files listed above.\n` +
      `- If a required detail is missing or an assumption turns out wrong, stop and ask instead of exploring to resolve it.\n` +
      `- Once the acceptance criteria are met and the verification command passes, stop.\n`,
  );

  return parts.filter(Boolean).join("\n").trimEnd() + "\n";
}

/**
 * The portion of a rendered prompt that should be re-scored.
 *
 * The "Do NOT", "Unresolved", and "Stop conditions" sections are prohibitions.
 * They legitimately contain words the linter treats as exploration triggers
 * ("do not refactor..."), so scanning them would penalise the prompt for the
 * very guardrails that make it cheap.
 */
export function scorableText(rendered: string): string {
  return rendered
    .split(/\n(?=## )/)
    .filter(
      (block) =>
        !/^## (Do NOT|Unresolved|Stop conditions)/i.test(block.trimStart()),
    )
    .join("\n");
}
