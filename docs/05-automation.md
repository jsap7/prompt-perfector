# Automation

## How far this actually goes

Cognition merged **659 Devin PRs into their own codebase in a single week**, up
from 154 in their best week the previous year. So the ceiling is high. But note
what they automated and how they trigger it before copying the ambition.

## The ladder

| Rung | What it is |
|---|---|
| 0 | **Manual prompts** in the web UI |
| 1 | **Playbooks** — reusable macros for recurring shapes |
| 2 | **Inbound triggers** — tag `@Devin` in Slack; tag it on a Linear/Jira ticket |
| 3 | **API triggers** — sessions fired by Sentry crashes, CI failures, deploy failures, review requests |
| 4 | **Scheduled runs** — e.g. daily automated design-system audits |

Rungs 2–4 are where Devin stops being a tool you visit and becomes
infrastructure that runs on its own.

What Cognition delegates internally: automated PR reviews, bug fixes, test
coverage, lint remediation, CI failure investigation, CVE patches, docs
maintenance, and bug triage.

## The warning, and it is the important part

**Automation multiplies session count. If per-session cost is bad, automation
multiplies the waste.**

Triggers mean every Sentry crash can spawn a session at $2.25+. Fire that at a
codebase with no snapshot, no Knowledge, and vague prompts, and you scale the
problem rather than solving it. Automation is an accelerant: it makes good unit
economics great and bad unit economics catastrophic.

## Therefore, sequence it

1. **Fix unit cost.** Machine snapshot, Knowledge, prompt discipline. Get a
   typical session from L/XL down to S/M.
2. **Measure it.** Session Insights; ACU per merged PR. You need a real number
   before scaling volume against it.
3. **Add Playbooks** for whatever you repeat. Purely defensive — safe now.
4. **Then triggers**, with a budget cap, starting from one narrow source.

Rungs 1 and below are safe at any time. Rung 2+ should wait for a measured
unit cost.

## If and when you get to triggers

- **Start with one source.** One repo, one alert type. Not "all of Sentry".
- **Prefer investigate-and-report over fix-and-PR** for anything automatic.
  Cheaper to review a wrong summary than a wrong PR.
- **Cap the budget** before turning it on.
- **Filter aggressively.** A noisy alert source becomes a noisy spend source at
  a fixed price per event.
- **Deduplicate.** The same crash firing fifty times should open one session.
