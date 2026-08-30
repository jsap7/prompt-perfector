# Measurement

You can't optimize spend you can't see. Devin ships the instrumentation; the
job is knowing which numbers mean something.

## Session Insights

Reports four things per session:

| Metric | Reading it |
|---|---|
| **ACU usage** | Compute consumed. Compare across *similar* tasks — absolute numbers mean little alone. |
| **User messages** | High count = frequent course corrections = the prompt was underspecified. |
| **Session size** | XS–XL composite of ACU and message frequency. |
| **Category** | Auto-classified task type (feature, bug fix, …). |

### L and XL are flagged unhealthy

The docs are direct: an L or XL session means Devin hit significant issues or
the scope was too broad for one session.

**Review these weekly.** They are where the money went, and each one is a
diagnosable failure — usually scope that should have been split, or a missing
piece of context that sent Devin exploring.

### High message count is a prompt defect

This is the most actionable signal available, because it measures precisely the
thing prompt discipline fixes. A session with many user messages is one where
you paid for Devin to guess wrong and be corrected. The guidance is to
frontload everything into the initial prompt.

## Action Items

The Actionable Feedback tab recommends concrete changes in two categories:

- **Machine setup** — dependencies to install, credentials to configure
- **Repo config** — build scripts, configuration changes

**Treat a repeated Action Item as a bill you keep choosing to pay.** If the
same dependency install is recommended across sessions, that install is costing
you every time — put it in the machine snapshot and it never costs again. This
is the loop closing itself: the tool tells you which fixed costs to eliminate.

Also flagged: remove misleading or outdated Knowledge, which causes
trial-and-error.

## The number that actually matters

Not ACU per session. **ACU per merged PR.**

Session-level cost is easy to game — you can lower it by splitting work
endlessly without shipping more. The unit economics question is what a merged
change costs you, end to end.

Track alongside it:

- **Abandonment rate.** Sessions that never produced a merged change are pure
  loss, and they're invisible in per-session averages.
- **Size distribution.** What fraction of sessions are L/XL? That fraction
  falling is the clearest evidence prompt discipline is working.

## A weekly review worth doing

Fifteen minutes, together:

1. Open every L/XL session from the week. For each: was it scope, or missing
   context?
2. Any Action Item appearing more than once → machine snapshot or repo config.
3. Any task shape appearing 3+ times → `pp playbook`.
4. Any fact Devin had to discover twice → Knowledge entry.
5. Note ACU per merged PR. Is it trending down?

Steps 2–4 each convert a recurring cost into a one-time fix. That's the whole
game.

## PP's own numbers

```bash
pp --stats
```

Reports prompts perfected and estimated ACU avoided. The estimate is heuristic
— derived from PP's own risk bands, not from Devin's billing — so treat it as
directional. Session Insights is the ground truth.
