# Work items, the scoping gate, and CI triage

Three commands that sit either side of the expensive step. All run on a small
model — these are extraction and classification tasks, not reasoning ones, and
routing cheap work to expensive models by default is where most overspend
comes from. Each call costs a fraction of a cent against an agent session at
$2.25 and up.

## The contract

A GitLab work item an agent can execute is **the same artifact as a PP prompt**
with a different wrapper. Defining that contract once means the creator and the
gate share a rule set: one writes it, the other checks it.

```
Title · Area · Objective · Files in scope · Steps · Constraints
Do NOT · Done when · Verify with · Open questions · Estimate
```

**Definition of ready:** every field populated, no open questions. That turns
"is this ready for an agent?" from a judgement call into a check.

## `pp issue` — create

```bash
pp issue "add rate limiting to the search endpoint, probably redis backed"
```

Produces a work item, checks it mechanically, copies it to the clipboard.

Two rules it holds hard:

**It never invents a file path.** Tested on a request naming no files, it
produced zero fabricated paths and six open questions instead. A wrong path is
worse than a missing one — the agent hunts for a file that does not exist, then
improvises.

**It never resolves a decision that is yours.** "probably redis backed" is half
a decision, so it asks rather than picking.

If a repo is indexed (`pp repo add`), verified-to-exist paths are supplied as
context, so the model can name real files without guessing.

### Mechanical readiness

Structural checks run in code, not through the model — a rule checkable in code
should never cost a token:

| Blocker | Why |
|---|---|
| open questions remain | the agent guesses or goes looking |
| no files in scope | first move is a repo search |
| no acceptance criteria | it keeps going and gold-plates |
| no verification command | it picks its own, often the full suite |
| estimate L or XL | large sessions are where work goes wrong |

## `pp gate` — check before assigning

```bash
pp gate --file item.md      # exit 0 if ready, 1 if not
```

Runs immediately before the most expensive step. The cheapest possible
intervention at the most expensive possible moment.

Exit codes make it usable in CI — block assignment on a non-zero exit.

It is deliberately prompted **not** to manufacture objections. A gate that never
passes anything gets ignored, and then it protects nothing. On a tight one-file
item it returns READY and no questions.

## `pp triage` — classify CI failures

```bash
pp triage --file ci.log
cat ci.log | pp triage
```

Classifies **real / flaky / environment / unclear** before anything expensive
spins up, and recommends `assign-agent`, `retry`, `fix-infrastructure`, or
`ask-human`.

Verified on all three failure shapes: a Playwright timeout that passed on retry
(flaky → retry), a `TypeError` from a changed signature (real → assign-agent),
and a DNS failure during `pip install` (environment → retry). Each cited actual
log lines as evidence.

It reads the flaky table from `.agents/map/tests.md` when present, so a known
flaky test is not re-diagnosed every time.

### Two rules in the generated agent prompt

Both were added after watching it get them wrong:

**Never offer a choice of fix.** The first version produced *"either update the
function signature or update the test call"* — a deferred decision, which is the
single most expensive thing you can hand an agent. If the correct fix is not
unambiguous from the log, the action becomes `ask-human` instead.

**Never permit editing the test.** An agent that weakens a test to go green has
done worse than nothing. The prompt now says fix the source, and if the test
itself looks wrong, stop and report rather than change it.

### It ends at a summary, not a fix

Investigation is the expensive part; the decision is the risky part. Automating
the first while keeping a human on the second captures most of the saving with
little of the risk.

## Model routing

Set in `~/.pp/config.json`:

```json
{ "model": "claude-opus-5", "smallModel": "claude-haiku-4-5" }
```

| Task | Model |
|---|---|
| maps, test map, lint, offline build | none — deterministic |
| issue creation, scoping gate, CI triage | `smallModel` |
| prompt rewriting | `model` |
| executing the work | Devin |

Override per call with `--model`.
