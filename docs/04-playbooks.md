# Playbooks

A Playbook is a reusable procedure for a task shape you repeat. It converts an
exploratory session into a scripted one.

**Playbooks are the one automation rung that is purely defensive** — they cut
per-session cost without increasing session volume. Everything higher on the
[automation ladder](05-automation.md) multiplies how many sessions you run.
This one just makes each one cheaper. Safe to adopt immediately.

## When to write one

**The 3× rule: if you've prompted the same task shape three times, it's a
Playbook.** Not the same task — the same *shape*. Bumping three different
dependencies is one shape.

## What teams actually use them for

Reported patterns, all deliberately boring:

- **Dependency upgrades** — identify outdated packages, upgrade, run tests after
  each. Monthly, one macro.
- **Service or component scaffolding** — project structure, Docker, CI config,
  health check endpoints, logging.
- **Changelog and docs maintenance** — weekly, previously manual.
- **Lint remediation, CVE patches, test coverage backfill.**
- **Bug triage** — read the report, search relevant code paths, check git
  history, summarize root cause and suggested fix.

Teams report roughly **3–5 hours/week saved** where there's a healthy backlog
of well-defined tasks. That conditional matters: the savings come from backlog
depth, not from cleverness.

## The best design pattern in that list

Notice that the bug-triage playbook **ends at a summary, not a merged PR**.

That's the strongest shape, and worth copying deliberately. Investigation is
the expensive part; the decision is the risky part. A playbook that automates
investigation and hands you the decision captures most of the savings with
little of the risk. Consider making "produce findings" the terminal step more
often than "produce a PR".

## Structure

```
# <name>

**When to use:** the trigger

## Inputs
{{PLACEHOLDER}} values supplied per run

## Procedure
Ordered, generalized steps

## Specifications
Constraints that always apply

## Do NOT
What keeps a scripted session from becoming exploratory

## Verification
The narrowest proving command

## Stop conditions
Ask rather than search; stop when verification passes
```

The **Do NOT** section matters as much here as in a one-off prompt. A Playbook
that runs monthly with unbounded scope is a recurring subscription to scope
creep.

## Generating one from PP

PP stores every prompt it perfects, so repeated shapes can be found rather than
remembered:

```bash
pp playbook --list    # show repeated shapes, free, no API call
pp playbook           # draft the top one, copies to clipboard
```

Detection clusters history by similarity across title, objective, verification
command, and the file types touched. Three or more similar prompts make a
candidate. Drafting generalizes what varied between runs into `{{PLACEHOLDER}}`
inputs and keeps only steps traceable to the real examples — it does not invent
procedure.

Review before saving. A drafted Playbook is a strong first draft, not a
finished one, and it inherits any bad habits present in the examples it learned
from.

## Knowledge vs. Playbooks

Easy to conflate:

| | Knowledge | Playbook |
|---|---|---|
| Holds | Persistent context and standards | A step-by-step procedure |
| Applies | Automatically, to everything | When invoked for a task |
| Answers | "How do things work here?" | "How do I do this specific job?" |

Use both together: the Playbook supplies the procedure, Knowledge supplies the
conventions it should follow.
