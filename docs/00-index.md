# Working efficiently with Devin

Everything we've worked out about getting more out of Devin for less ACU spend.
Written August 2026. Sources are in [09-sources.md](09-sources.md); anything
not sourced there is our own reasoning and is marked as such.

## Read in this order

| # | Doc | What it answers |
|---|---|---|
| 1 | [ACU cost model](01-acu-cost-model.md) | What you're actually buying, and why token-thinking misleads |
| 2 | [Prompting Devin](02-prompting-devin.md) | Why prompts cost money, and the structure that fixes it |
| 3 | [Fixed costs](03-fixed-costs.md) | Snapshots and Knowledge — the biggest lever, and the least used |
| 4 | [Playbooks](04-playbooks.md) | Scripting the work you repeat |
| 5 | [Automation](05-automation.md) | How far this goes, and the order to do it in |
| 6 | [Measurement](06-measurement.md) | Session Insights, and the number that actually matters |
| 7 | [Team setup](07-team-setup.md) | Credentials, onboarding, shared context |
| 8 | [PP internals](08-pp-internals.md) | How this repo's tool works |
| 9 | [Sources](09-sources.md) | Where each claim came from |
| 10 | [Offline mode](10-offline-mode.md) | Building prompts with no API call at all |

## The one-paragraph version

Devin bills **agent wall-clock time**, not tokens — about one ACU per fifteen
minutes of active work, at roughly $2.00–2.25. So the expensive thing is never
the code Devin writes; it's Devin *reading*: booting and rebuilding an
environment it rebuilt yesterday, relearning conventions it relearned last
week, hunting for a file your prompt didn't name, and retrying down dead ends.
Three of those four are fixed costs you can eliminate outright with snapshots
and Knowledge. The fourth is what prompting fixes. Do the fixed costs first —
they pay every session forever, while a better prompt pays once.

## The counterintuitive bit

**A longer, more specific prompt is cheaper than a short vague one.** This is
the opposite of how per-token pricing trains you to think, and it's the single
most important thing to internalise. Detail is not overhead here. Detail is the
discount.
