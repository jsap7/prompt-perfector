# Offline mode

`pp --offline` builds a complete Devin prompt with **no API call, no
credentials, and no network**. It is not a degraded fallback — for some of the
job it is strictly better than the model.

```bash
pp --offline "your request"
```

It also runs automatically whenever no credentials are present, so a missing
key never means a missing tool.

## Why it isn't just a weaker model

Three things a local tool can do that a model genuinely cannot:

### 1. It can read your repo

The model *infers* file paths. PP *looks them up*, via `git ls-files`. This is
the single biggest smell — `NO_PATHS` — and offline mode kills it with ground
truth rather than a guess.

Say "the lint code" from inside the repo and it resolves `src/core/lint.ts`.
Matching is on distinctive path tokens; a word that hits more than eight files
is treated as uninformative and ignored, because a wrong path costs more than
no path.

It also detects the repo name from the git remote and the test command from
`package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod`, and
friends — so **Verify with** fills itself in.

### 2. The most valuable output is boilerplate

The **Do NOT** block and stop conditions are the biggest ACU savers, and
they're constants. They never needed a model:

- Do not modify files outside the list above.
- Do not reformat, rename, or refactor code unrelated to this change.
- Do not upgrade, add, or remove dependencies.
- Do not broaden test coverage beyond what this change requires.

Every offline prompt gets these, plus any prohibition you actually spoke, plus
your repo's `offLimits` directories.

### 3. Missing information gets asked, not invented

The linter already knows what's absent. Offline mode turns each gap into a
direct question instead of a guess. You answering costs five seconds; Devin
discovering it costs ACUs; a model guessing wrong costs more than either.

## What it does

**Normalizes dictation.** Wispr Flow transcribes hesitation faithfully.
`"src slash payments slash stripe dot ts"` becomes `src/payments/stripe.ts`;
`"underscore"` and `"dash"` are joined; filler and politeness preamble are
dropped; repeated words collapse. Spoken corrections ("actually, wait") are
*flagged rather than deleted* — too risky to guess which version you meant.

**Splits into clauses, not sentences.** Dictation arrives as one long
comma-spliced run, so splitting on `.` alone leaves a single blob — and one
negative phrase anywhere in it ("don't touch the UI") then drags the whole
request into the prohibitions. Clause splitting is what makes the classifier
work at all.

**Classifies each clause** into objective, steps, acceptance ("should", "so
that"), prohibitions ("don't", "never", "without"), and verification (a real
command).

**Strips navigation.** "go into src/foo.ts and add X" becomes objective
"add X" with the path captured separately.

## What it cannot do

Honest limits — this is where the model earns its cents:

- **No semantic rewriting.** It restructures your words; it doesn't improve
  them. A vague objective stays vague.
- **No task splitting.** It won't notice you bundled three unrelated asks.
- **No inference.** If you didn't say the acceptance criteria, it asks rather
  than deriving something sensible from context.
- **Lexical, not semantic, file matching.** Say "the payment thing" when the
  file is `billing.ts` and it won't connect them.

Typical result: offline takes a wide-open prompt from ~85 to ~30. The model
pass takes it closer to 0. Offline gets most of the structural win for free;
the model gets the judgment.

## When to use which

| | Use |
|---|---|
| No key yet, or offline | `--offline` |
| Fast, mechanical, you already know the files | `--offline` |
| Rambling, half-formed, unsure of scope | the model path |
| You want the bundled asks split out | the model path |
| Checking a prompt you wrote by hand | `--lint` |
