# PP internals

## Architecture

```
src/
  cli.tsx              entry, arg parsing, subcommands, non-interactive mode
  core/
    types.ts           shared shapes
    lint.ts            deterministic ACU-burn detector (no API, free)
    perfect.ts         Claude rewrite pass, structured outputs
    render.ts          PerfectedPrompt → the text pasted into Devin
    run.ts             pipeline glue: analyze → perfect → render → re-score
    knowledge.ts       config → Devin Knowledge entries
    playbook.ts        history clustering + Playbook drafting
    config.ts          ~/.pp/config.json, repo profiles
    history.ts         ~/.pp/history.jsonl
    auth.ts            credential source detection
    clipboard.ts       pbcopy/clip/xclip, no dependency
  ui/                  Ink components
```

## Two layers, deliberately

**The linter is free and runs always.** Pure regex and heuristics, no API call,
instant. This matters more than it sounds: it means the risk meter can update
live while you dictate, and `pp --lint` works with no credentials at all. You
can watch WIDE OPEN drop to TIGHT as you add a file path.

**The rewriter costs a fraction of a cent** and runs on submit. Uses structured
outputs so the result is a typed object rather than prose to parse.

The economics justify the second layer easily: a rewrite is cents against ACUs
at $2.25. Even a handful of avoided ACUs a week covers it many times over.

## Scoring

Each smell carries a weight; the sum maps to a band:

| Score | Band | Est. ACU |
|---|---|---|
| 0–20 | tight | 0.3–1 |
| 21–45 | ok | 1–3 |
| 46–70 | loose | 3–7 |
| 71–100 | wide-open | 7–15 |

Bands are calibrated against the published usage shapes in
[01-acu-cost-model.md](01-acu-cost-model.md). They are **heuristics, not
billing data** — directional guidance, not a quote.

### The negation problem

Re-scoring the output naively is wrong. A good prompt contains
`"Do not refactor anything outside scope"` — which trips the `VAGUE_IMPROVE`
detector on the word *refactor*, penalising the prompt for the very guardrail
that makes it cheap.

`scorableText()` strips the **Do NOT**, **Unresolved**, and **Stop conditions**
sections before re-scoring, since those are prohibitions rather than
instructions. Measured effect on a real example: **0/100 with stripping, 26/100
without.**

## Design decisions worth preserving

**Never invent a file path.** A wrong path costs more than a missing one —
Devin hunts for a file that doesn't exist, then improvises. Unknowns become the
`gaps` list instead.

**Unresolved gaps render as stop-and-ask, not omitted.** An unknown Devin knows
to ask about costs one message; an unknown it doesn't know about costs a repo
search.

**The model decides nothing that's yours to decide.** Deferred design choices
surface as questions rather than being silently resolved.

**Dictation-shaped input.** Wispr Flow delivers a whole utterance as one large
chunk, not per-character events, so any input longer than one character is
inserted verbatim rather than interpreted as a keypress. Enter adds a newline;
a blank line or Ctrl+D submits.

## Playbook clustering

Jaccard similarity over normalized token sets drawn from title, objective,
verification command, and the file *extensions* touched — extensions capture
the shape of work without pinning to one file. Threshold 0.28, minimum cluster
size 3.

`clusterEntries()` is pure and takes rows as an argument specifically so it can
be tested without touching `~/.pp`.

## Commands

```bash
pp                        interactive
pp "text"                 one-shot: perfect, print, copy
echo "..." | pp           from stdin
pp --lint "text"          score only, free
pp knowledge              export Knowledge entries
pp playbook [--list]      find repeated shapes, draft a Playbook
pp --auth                 credential source
pp --stats                cumulative savings
pp --config               config path
```

## Known limits

- ACU estimates are heuristic, not billing-derived.
- Clustering is lexical, not semantic — differently-worded instances of one
  shape may not group.
- The linter is English- and regex-based; novel phrasings of a bad pattern slip
  through.
- History is local per machine, so Playbook detection doesn't see your
  teammate's prompts.
