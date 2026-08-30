# The ACU cost model

## What an ACU is

An **Agent Compute Unit** is Devin's normalized measure of resources consumed
while actively working: VM time, model inference, and network. One ACU is
roughly **fifteen minutes of active autonomous work**.

Pricing as of August 2026:

| Plan | Cost | Per-ACU |
|---|---|---|
| Core | $20/mo + usage | ~$2.25 |
| Team | $500/mo, 250 ACUs included | ~$2.00 |
| Enterprise | custom | — |

Devin only consumes ACUs while actively working or while the VM is running. It
sleeps after roughly 0.1 ACU of inactivity and stops charging — so there's no
reason to keep a session warm with empty pings.

## Why "conserve tokens" is the wrong instinct

ACUs meter **time**, not tokens. That single fact inverts most of the
optimization intuition carried over from per-token APIs:

| Per-token thinking | ACU reality |
|---|---|
| Shorter prompt = cheaper | Shorter prompt = *more expensive*, because it's underspecified |
| Context is the cost | Context is the **discount** — it removes work |
| Trim detail to save money | Add detail to save money |
| Cost scales with output size | Cost scales with how long the agent flails |

A prompt that is 400 words instead of 40 costs no measurable extra. A prompt
that sends Devin looking for a file costs an ACU.

## Where the time actually goes

Every session spends wall-clock on four things:

1. **Setup** — boot, clone, install dependencies, build
2. **Orientation** — locating files, learning conventions, reading context
3. **The work** — the change you actually wanted
4. **Retries and dead ends** — wrong turns, failed builds, course corrections

Only #3 is what you meant to buy.

The trap: **#1 and #2 are fixed costs re-paid every single session** unless you
explicitly eliminate them. Prompting only attacks #2 and #4. That's why prompt
quality, despite being the most-discussed lever, is not the biggest one.

### A worked example

Say your install-and-build takes 8 minutes. That's ~0.5 ACU of setup on every
session, before Devin reads a line of your code. Over 100 sessions:

```
100 sessions × 0.5 ACU × $2.25  =  $112 spent on `npm install`
```

A machine snapshot removes that number entirely. No prompt improvement can.

## Task size and cost, observed

Rough bands reported for typical work:

| Shape | ACUs | Cost |
|---|---|---|
| Small, tightly scoped, bounded repo | under 1 | ~$2 |
| Medium feature following an existing pattern | 2–7 | $5–15 |
| Large or ambiguous work | 7–15+ | $16–34+ |

The spread between the top and bottom row is roughly **15×**, and it is driven
far more by specification quality and environment readiness than by how much
code actually changes. That spread is the entire opportunity.

## The strategic consequence

Exploration is **cheap when a human does it interactively** and **expensive
when Devin does it autonomously** — the same activity, wildly different price.

So the efficient division of labour is:

- Use an interactive tool (Claude Code, Cursor) to work out *what needs doing*
- Hand Devin a specification to *execute*

Devin is a strong executor of well-specified, parallelizable work and a poor
substitute for deciding what the work is. Sessions that start with "figure out
whether…" are the ones that show up as L/XL in Session Insights.
