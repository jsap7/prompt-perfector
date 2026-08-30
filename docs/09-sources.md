# Sources

Everything in these docs traces to one of the following, gathered August 2026.
Claims not sourced here are our own reasoning and are marked as such in context.

## Cognition / Devin official

- [Instructing Devin Effectively](https://docs.devin.ai/essential-guidelines/instructing-devin-effectively)
  — prompt structure, what causes exploration mode, scoping guidance, Knowledge
  vs. Playbooks.
- [Session Insights](https://docs.devin.ai/product-guides/session-insights)
  — the four metrics, L/XL as unhealthy, Action Items, reducing wasted ACUs.
- [Creating Playbooks](https://docs.devin.ai/product-guides/creating-playbooks)
  — Playbook structure and intent.
- [How Cognition Uses Devin to Build Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin)
  — 659 Devin PRs merged in a week (up from 154); internal task types; trigger
  channels (Slack, Linear/Jira, API, GitHub); Ask Devin.
- [Devin's 2025 Performance Review](https://cognition.ai/blog/devin-annual-performance-review-2025)
  — task suitability.

## Pricing and ACU mechanics

- [ACU guide](https://fast.io/resources/devin-acu-guide/) — ACU definition, VM
  time + inference + networking, ~15 minutes per ACU.
- Pricing survey, August 2026: Core $20/mo + ~$2.25/ACU; Team $500/mo with 250
  ACUs at ~$2.00. Task-size cost bands.

## Practitioner reports

- [Playbook guide](https://fast.io/resources/devin-ai-playbook-guide/) — real
  playbook patterns (dependency upgrades, scaffolding, changelogs).
- Practitioner write-ups reporting ~3–5 hours/week saved on teams with a
  healthy backlog of well-defined tasks.

## Anthropic (for PP itself)

- Claude API TypeScript SDK: structured outputs via `messages.parse()` +
  `zodOutputFormat`, adaptive thinking, prompt caching, credential resolution
  order.

## A note on freshness

Devin's pricing, plan structure, and feature set have moved repeatedly. Prices
here are August 2026. **Re-check pricing before using these numbers in a
budget** — the reasoning stays valid even when the per-ACU figure moves, since
every argument here is about ratios rather than absolutes.
