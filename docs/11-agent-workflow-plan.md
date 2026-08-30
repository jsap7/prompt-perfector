# Agent workflow plan

Drafted August 2026. **All of this is now built** — `pp init` (§ The shape) and
the three agents (§ The agents), documented in
[12-work-items-and-triage.md](12-work-items-and-triage.md). Kept as the record
of the reasoning and the build order.

Target stack: **React frontend, Python backend, monorepo, unit + E2E tests,
GitLab, Devin as the executing agent.**

## The pattern

Every artifact below is the same move: **convert a recurring discovery cost
into a stored artifact.**

Codebase map = stored orientation. Test map = stored verification knowledge.
Work item = stored specification. Knowledge = stored conventions. Machine
snapshot = stored environment.

The question for any new idea is only: *what are our agents rediscovering every
single time?* Anything on that list is a candidate. Anything not on it is
probably not worth building.

## The shape: `pp init` — **built**

PP is something you drop into a repo, which generates the substrate agents
navigate by. Deterministic — the map is *generated*, never hand-written,
because a hand-written map goes stale silently and a stale map is worse than
none. No API call, so it can run in CI.

Everything is discovered from the repo. You should not have to answer questions
about your own layout; the answers are on disk, and asking is how tools like
this end up unused.

```bash
pp init ~/work/the-monorepo      # analyze and write .agents/
pp init --dry-run                # show what it found, write nothing
```

Verified against a React + Python monorepo fixture: it separates frontend and
backend areas by manifest and dependencies, splits the four test suites
(pytest unit, pytest integration, vitest, playwright), and extracts routes,
models, and components with exact `file:line`. On a repo with no Python or
routes it degrades to what it can actually find rather than inventing sections.

```
pp init                    # analyze the repo, write .agents/
pp init --refresh          # regenerate; wire this into CI on merge to main
```

Proposed output:

```
.agents/
  README.md              entry point — the first thing any agent reads
  map/
    overview.md          areas, entry points, how to navigate
    backend.md           Python modules, routes, models, services
    frontend.md          React components, routes, state
    tests.md             THE TEST MAP — area → command, cost, when to run
  knowledge/             ready to paste into Devin Knowledge
  playbooks/             recurring procedures
  work-items/
    template.md          the contract
  devin-setup.md         machine snapshot steps + Knowledge checklist
```

### How agents find it

Generating artifacts nobody reads is worthless. Three mechanisms, use all:

1. **A Devin Knowledge entry** that says: before doing anything in this repo,
   read `.agents/README.md` and the map chunk for the area you are touching.
2. **`AGENTS.md` at repo root** pointing to `.agents/` — picked up by most
   coding agents by convention.
3. **The work item template** includes a field naming the relevant map chunk,
   so it arrives with the task rather than needing to be sought.

## The artifacts

### 1. Codebase map

**Job:** answer *"where is X?"* without a search. Index-shaped, not prose.
One line per file. Prose costs tokens to read and still needs inference; a
lookup table doesn't.

**Chunked by area** so an agent loads `backend.md`, not everything.

Generated deterministically — PP already builds the raw material. `pp repo add`
produces the file list, a symbol table with line numbers, detected conventions,
off-limits directories, and the test command. `pp init` is largely a renderer
over that index.

Stack-specific extraction:

| | Detect | Emit |
|---|---|---|
| Python | `def` / `class`, FastAPI/Django/Flask route decorators, Pydantic / ORM models | module → purpose, route table, data models |
| React | component definitions, router config, hooks, context providers | component → file, route table, state locations |
| Shared | package boundaries in the monorepo | area ownership |

**Staleness policy:** regenerate on every merge to main via CI. Never edit by
hand. If it drifts, agents get pointed at files that moved — the exact failure
PP exists to prevent.

### 2. Test map — the highest-ROI item

You have unit **and** E2E tests. This matters more than it sounds, because
Devin bills wall-clock: **E2E suites are the most expensive thing an agent can
do repeatedly**, and agents iterate.

Without a test map, an agent either guesses which tests to run or runs
everything, on every iteration. That is the `FULL_SUITE` problem multiplied by
the number of attempts.

The map should encode, per area: the narrow command, roughly what it costs, and
**when it is allowed to run**.

```
Area: backend/payments
  Per iteration:  pytest tests/unit/payments -q          (~15s)
  Before done:    pytest tests/integration/payments      (~2m)
  E2E:            only if the change alters a user-visible flow.
                  Run once, at the end. Never per iteration.
```

Encode the discipline as an explicit rule agents inherit:

> Run the narrow unit command after each change. Run integration once, when you
> believe you are done. Run E2E at most once, only when the change alters a
> user-facing flow. Never run the full suite to check a single edit.

**Flaky test registry** belongs here too. If any of the suite is flaky, agents
burn time retrying — and worse, sometimes "fix" the test rather than the code.
A known-flaky list agents consult before believing a failure is cheap to
maintain and prevents a bad class of outcome.

### 3. Work item contract

The realization: **a GitLab work item an agent can execute is the same artifact
as a PP prompt**, with a different wrapper.

Design the contract first; the agents that write and check it then become
mostly configuration.

Required fields:

```
Title
Area              (maps to a .agents/map chunk)
Objective         one sentence, the concrete change
Files in scope    explicit paths
Steps             ordered
Constraints       patterns to follow
Do NOT            explicit prohibitions
Done when         observable criteria
Verify with       the narrow command from the test map
Open questions    what is genuinely unknown — ask, do not explore
```

Ships as a GitLab work item template (you have none today — this is the first
concrete deliverable, and it needs no token or automation).

**Definition of ready:** a work item with every field populated and no open
questions is agent-executable. One with open questions is not. That turns
"is this ready?" from judgment into a check.

### 4. Knowledge bundle

Generated entries for Devin Knowledge: conventions, layout, the test
discipline, off-limits directories, the pointer to `.agents/`.

PP already exports these (`pp knowledge`). `pp init` writes them to disk so
they are reviewable and version-controlled rather than living only in one
person's config.

### 5. Devin self-setup

A generated `devin-setup.md` — a checklist Devin can execute on itself:
the install and build steps worth baking into a machine snapshot, and the
Knowledge entries to create.

This is the fixed-cost elimination from [03-fixed-costs.md](03-fixed-costs.md),
turned into something you hand to Devin once rather than doing by hand.

## The agents

### Issue creator — small model

Feature description in, work item out, conforming to the contract. Small model
is the right call: it is a structured extraction and formatting task, not a
reasoning one. Use structured outputs so the result is typed, and validate the
fields mechanically rather than trusting the model.

It should refuse to invent file paths — same rule as PP. Unknown fields become
open questions.

### Scoping gate — small model

Runs *before* an expensive agent picks up a ticket. Checks the item against the
contract, then either passes it or returns the questions blocking it.

The cheapest possible intervention at the most expensive possible moment.
Shares its rule set with the issue creator: one writes, one checks.

### CI failure triage — small model

You have pipelines. Classify each failure as **flaky / real / environment**
before anything expensive spins up.

Design note: the strongest version **ends at a summary, not a fix**.
Investigation is the expensive part; the decision is the risky part. Automating
investigation while keeping a human on the decision captures most of the
savings with little of the risk.

### Model routing policy

You have access to many models. Make the routing explicit rather than
defaulting everything to the best one:

| Task | Tier |
|---|---|
| Codebase map, test map | none — deterministic |
| CI triage, classification | small |
| Issue creation, scoping gate | small |
| Prompt rewriting (PP) | mid |
| Execution on ambiguous code | Devin |
| Review of risky changes | mid/large |

Most overspend comes from routing cheap tasks to expensive models by default.

## Build order

Dependencies are real here:

1. **Codebase map + test map.** The context layer; everything assumes it.
   The test map alone probably pays for the whole effort.
2. **Work item contract + GitLab template.** No token needed. Defines "ready".
3. **Issue creator.** Produces the contract. Small model.
4. **Scoping gate.** Validates it. Reuses the same rules.
5. **CI triage + flaky registry.** Independent loop, independently valuable.
6. **Feedback loop.** Closes it and keeps 1 fresh.

### The feedback loop, since it is the one everyone skips

After a session goes badly, ask: *what did the agent have to discover that it
should not have had to?* The answer becomes a map entry, a Knowledge item, a
test-map row, or a snapshot change.

Without this, the same discovery is paid for indefinitely. It belongs in the
weekly review from [06-measurement.md](06-measurement.md).

## Open questions

- **GitLab token.** Nothing in this repo has one. Does an agent-usable token
  exist? It decides whether the issue creator drafts or creates.
- **Monorepo layout.** How are frontend and backend actually split? Determines
  what an "area" is, which the map and test map both key off.
- **E2E cost.** Roughly what does a full E2E run take in wall-clock? That number
  sets how much the test-map discipline is worth.
- **Flakiness.** Is any of the suite flaky today? Decides whether the registry
  is urgent or optional.
- **Who owns `.agents/`?** Generated files in the repo need a review policy, or
  they become noise in every MR.
