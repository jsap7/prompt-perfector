# Prompting Devin

## The principle

Every ambiguity in a prompt is resolved by Devin *searching*. Searching bills
wall-clock. Therefore: **remove every reason for Devin to search.**

Cognition's own guidance names the causes directly — unmade decisions, missing
file paths, absent success criteria, and no verification step all push Devin
into exploration mode. Those are the four things to eliminate.

## The structure

This is what `pp` emits, and it maps onto Cognition's recommended shape:

```
# <task name>
Repo: <name>

## Objective
One sentence. The concrete change, not the motivation.

## Files in scope
Explicit paths. This single section removes the most expensive search.

## Steps
Ordered, discrete, imperative.

## Constraints
Patterns to follow, libraries to reuse, what stays unchanged.

## Do NOT
The highest-leverage section. See below.

## Done when
Observable, checkable statements.

## Verify with
The narrowest command that proves it.

## Stop conditions
Ask rather than explore; stop when acceptance is met.
```

## Why "Do NOT" is the highest-leverage section

Devin's default behaviour is thoroughness, and **thoroughness is what costs**.
Left unbounded it will improve things it passes on the way: reformat a file,
tidy an import, broaden a test, upgrade a dependency it noticed was stale.

Each of those is defensible in isolation and none of them is what you asked
for. Explicit prohibitions are how you buy only the change you wanted.

Write them tied to the specific task, not as boilerplate:

> - Do not change timeouts for any other payment provider.
> - Do not refactor the Stripe client, reformat the file, or upgrade the stripe dependency.
> - Do not touch files outside `src/payments/stripe.ts`.

## Never guess a file path

**A wrong path is worse than a missing one.** Devin burns ACUs hunting for a
file that doesn't exist, then improvises a location.

PP enforces this: it never invents paths. Anything it can't determine becomes a
question for you instead. The economics are stark — you answering takes five
seconds and costs nothing; Devin discovering the same fact costs real money.

If a detail genuinely is unknown at send time, say so explicitly *and tell
Devin to ask rather than look*:

> If you cannot determine X, ask me directly rather than searching the repo.

## One session per task

Cognition recommends a session per task. Bundled asks share one context window,
so later work pays to re-read everything from the earlier work — cost compounds
within a session rather than adding.

PP detects this and lists the extra asks under **Split into separate sessions**.

## The smell catalogue

These are the patterns `pp --lint` detects, free and offline. Useful as a
checklist even for prompts written by hand.

| Smell | Why it costs |
|---|---|
| `NO_PATHS` | Nothing points at a file — the first move is a repo scan |
| `EXPLORE_VERB` | "investigate", "look into", "dig into" are instructions to go read |
| `SCOPE_EXPLOSION` | "the whole codebase", "everywhere" — cost scales with what's read, not changed |
| `DEFERRED_DECISION` | "you decide", "best approach" — Devin explores alternatives before coding |
| `VAGUE_IMPROVE` | "improve", "optimize", "clean up" with no metric — two unbounded searches stacked |
| `NO_ACCEPTANCE` | No definition of done, so it keeps going and gold-plates |
| `NO_VERIFY` | Devin picks its own verification — often the full suite, repeatedly |
| `FULL_SUITE` | Full runs bill as VM time on every iteration, and it iterates |
| `OPEN_TAIL` | "and anything else", "while you're in there" — a scavenger hunt |
| `MULTI_GOAL` | Several asks in one session; later work re-reads earlier context |
| `HEDGE` | "somewhere in the auth code" — every hedge is a fact Devin must establish |
| `NO_REPO` | Opening moves spent working out where it is |
| `TOO_THIN` | A one-liner leaves everything unspecified |

## Frontload everything

Session Insights treats a **high user-message count as a warning sign** — it
means Devin needed frequent course corrections. Each correction also adds
context that gets re-read on every subsequent step, so mid-session fixes cost
more than they appear to.

Corollary: **restarting beats correcting.** If a session is off-track early,
kill it, fix the prompt, start again. Do not try to steer it back.
