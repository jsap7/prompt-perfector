#!/usr/bin/env node
import React from "react";
import { render as inkRender } from "ink";
import { App } from "./ui/App.js";
import { loadConfig, ensureConfig, CONFIG_PATH } from "./core/config.js";
import { analyze } from "./core/lint.js";
import { runPipeline } from "./core/run.js";
import { copy } from "./core/clipboard.js";
import { stats } from "./core/history.js";
import { credentialSource } from "./core/auth.js";
import { bandLabel } from "./ui/theme.js";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const HELP = `
${c.bold("pp")} — prompt perfector. Talk loose, send tight.

Turns a rambling voice dump into a scoped Devin prompt, so Devin acts
instead of exploring. ACUs bill agent wall-clock time; every unnamed file
and undecided design choice is Devin reading your repo on your budget.

${c.bold("USAGE")}
  pp                        interactive — dictate into it with Wispr Flow
  pp "some request"         perfect it, print it, copy it, exit
  echo "..." | pp           same, from stdin
  pp --lint "some request"  score it only, no API call, free
  pp --auth                 show which credential PP is using
  pp --stats                what PP has saved you so far
  pp --config               create/print the config path
  pp --help

${c.bold("KEYS (interactive)")}
  enter          new line
  blank line     perfect it
  ctrl+d         perfect it
  c              copy result       r  refine with a follow-up
  w              why it scored     n  start over      q  quit

${c.bold("SETUP")}
  Needs an Anthropic API key: export ANTHROPIC_API_KEY=... (or run: ant auth login)
  Per-repo profiles and standing constraints live in ${CONFIG_PATH}
`;

function printResultPlain(rendered: string, before: number, after: number) {
  process.stdout.write("\n" + rendered + "\n");
  process.stdout.write(
    c.dim(`risk ${before} → ${after}\n`),
  );
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }

  if (argv.includes("--config")) {
    process.stdout.write(ensureConfig() + "\n");
    return;
  }

  if (argv.includes("--auth")) {
    const src = credentialSource();
    process.stdout.write(
      src
        ? c.green(`credentials: ${src}\n`)
        : c.yellow("no credentials found — export ANTHROPIC_API_KEY or run: ant auth login\n"),
    );
    process.exitCode = src ? 0 : 1;
    return;
  }

  if (argv.includes("--stats")) {
    const s = stats();
    if (!s.runs) {
      process.stdout.write(c.dim("no runs yet.\n"));
      return;
    }
    process.stdout.write(
      `${c.bold(String(s.runs))} prompts perfected · ` +
        c.green(`~${s.acuSavedLow}–${s.acuSavedHigh} ACU of Devin time avoided\n`),
    );
    return;
  }

  const config = loadConfig();
  const lintOnly = argv.includes("--lint");
  const positional = argv.filter((a) => !a.startsWith("-")).join(" ").trim();
  // Only touch stdin when there is no argv text. Reading it unconditionally
  // hangs forever wherever stdin is an open pipe that never closes (CI, scripts).
  const piped = positional ? "" : (await readStdin()).trim();
  const text = positional || piped;

  if (lintOnly) {
    if (!text) {
      process.stderr.write(c.red("--lint needs some text.\n"));
      process.exitCode = 1;
      return;
    }
    const a = analyze(text, config.perAcu);
    process.stdout.write(
      `\n${c.bold(bandLabel(a.before.band))}  score ${a.before.score}/100  ` +
        c.dim(`~${a.before.acuLow}–${a.before.acuHigh} ACU ($${a.before.costLow}–$${a.before.costHigh})\n\n`),
    );
    for (const s of a.smells) {
      const paint = s.severity === "critical" ? c.red : s.severity === "high" ? c.yellow : c.dim;
      process.stdout.write(`${paint(s.id.padEnd(18))} ${c.dim(s.evidence)}\n`);
      process.stdout.write(`${" ".repeat(19)}${c.dim("→ " + s.fix)}\n`);
    }
    process.stdout.write("\n");
    return;
  }

  if (!credentialSource()) {
    process.stderr.write(
      c.yellow("No Anthropic credentials found.\n") +
        c.dim("  export ANTHROPIC_API_KEY=sk-ant-...   or run: ant auth login\n") +
        c.dim("  Meanwhile, `pp --lint \"...\"` scores prompts for free.\n"),
    );
    process.exitCode = 1;
    return;
  }

  // Non-interactive: text supplied up front and we are not on a TTY-driven session.
  if (text && !process.stdin.isTTY) {
    const r = await runPipeline(text, config);
    printResultPlain(r.rendered, r.analysis.before.score, r.after.score);
    await copy(r.rendered).catch(() => {});
    return;
  }

  if (!process.stdout.isTTY) {
    process.stderr.write(
      c.yellow("pp needs a terminal for interactive mode.\n") +
        c.dim('  Pipe text instead: echo "..." | pp\n'),
    );
    process.exitCode = 1;
    return;
  }

  inkRender(<App config={config} initial={text || undefined} />);
}

main().catch((e) => {
  process.stderr.write(c.red(`\n${e instanceof Error ? e.message : String(e)}\n`));
  process.exitCode = 1;
});
