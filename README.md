# PP — Prompt Perfector

Talk loose, send tight.

You dictate a rambling request with Wispr Flow. PP hands back a scoped Devin
prompt that doesn't leave Devin any reason to go wandering through the repo.

## Why this saves money

Devin bills in **ACUs** — roughly **15 minutes of active agent work, ~$2.25**
(~$2.00 on Team). Critically, ACUs bill the agent's **wall-clock time, not
tokens**. So the expensive part is never the code Devin writes. The expensive
part is Devin *reading*:

- scanning the repo for a file your prompt didn't name
- weighing design options your prompt didn't decide
- re-running the full test suite because you didn't scope one
- chasing "and anything else you notice"

Cognition's own docs name the same culprits: unmade decisions, missing file
paths, absent success criteria, and no verification step all push Devin into
exploration mode. PP removes them mechanically.

Rewriting a prompt costs a fraction of a cent. One avoided ACU is $2.25.

## Install

Copy-paste the whole block. Takes about a minute.

```bash
git clone git@github.com:jsap7/prompt-perfector.git
cd prompt-perfector
npm install
npm run build
npm link
```

Then set up auth and the short name:

```bash
# 1. credentials — either one works
export ANTHROPIC_API_KEY=sk-ant-...     # add this line to ~/.zshrc to persist
#   ...or, no key to manage at all:
ant auth login

# 2. short command name (see note below)
echo 'alias pp="ppf"' >> ~/.zshrc

# 3. reload and verify
source ~/.zshrc
pp --auth
```

`pp --auth` should print `credentials: ANTHROPIC_API_KEY` (or
`ant auth profile`). If it does, you're done:

```bash
pp
```

### Why the command is `ppf`

Homebrew's `nss` package already owns `/opt/homebrew/bin/pp` — an ASN.1
pretty-printer. Clobbering a brew-managed symlink would break on the next
`brew upgrade`, so PP installs as `ppf` and the alias gives you `pp` in your
own shell only.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `pp: command not found` | `source ~/.zshrc`, or check `npm link` succeeded |
| `No Anthropic credentials found` | Run `pp --auth`. If you have an `export ANTHROPIC_API_KEY=` line with **no value**, delete it — an empty key shadows every other credential source |
| `zsh: permission denied` on `npm link` | Your npm global dir needs write access: `sudo chown -R $(whoami) $(npm config get prefix)` |
| Want to update later | `git pull && npm install && npm run build` |

### No key yet?

Everything except the model rewrite works with no credentials:

```bash
pp --lint "your prompt"      # score it
pp --offline "your prompt"   # build a full prompt, no API call
```

Index your work repos once and they resolve from any directory:

```bash
pp repo add ~/Development/checkout
pp --offline "in checkout, fix the retry logic"   # works from anywhere
```

`--offline` reads your actual repo — it resolves `"the lint code"` to
`src/core/lint.ts` via `git ls-files`, detects your test command, and applies
the standard prohibitions. PP falls back to it automatically when no key is
present. See [docs/10-offline-mode.md](docs/10-offline-mode.md).

## Use

```bash
pp                        # interactive — dictate straight into it
pp "some request"         # perfect it, print, copy, exit
echo "..." | pp           # from stdin
pp --lint "some request"  # score only. no API call, free, instant
pp --stats                # what PP has saved you so far
pp --config               # create / print the config path
```

### Keys

| key | |
|---|---|
| `enter` | new line |
| blank line, or `ctrl+d` | perfect it |
| `c` | copy result |
| `r` | refine with a follow-up ("actually the file is src/auth/session.ts") |
| `w` | why it scored that way |
| `n` / `q` | start over / quit |

The risk meter updates **live as you talk**, before you spend anything. You can
watch WIDE OPEN drop to TIGHT while you add a file path.

## What it produces

A structured Devin prompt: objective, files in scope, ordered steps,
constraints, **Do NOT**, done-when, verify-with, and stop conditions.

Three parts do the heavy lifting:

- **Do NOT** — the highest-leverage section. Devin's default is thoroughness,
  and thoroughness is what costs. This forbids the specific adjacent work the
  task invites.
- **Answer these** — facts PP couldn't determine. Filling one in takes you five
  seconds; Devin discovering the same fact costs ACUs. PP never invents a file
  path, because a wrong path is worse than no path.
- **Split into separate sessions** — Cognition recommends one session per task.
  Bundled asks make later work pay to re-read earlier context.

## Beyond prompting

Prompt quality is the visible lever, not the biggest one. Setup and orientation
are **fixed costs re-paid every session** — a machine snapshot and good
Knowledge eliminate them outright, and no prompt improvement can.

PP helps you move that context to where it actually pays:

```bash
pp knowledge      # your repo profiles → Devin Knowledge entries, clipboard-ready
```

`~/.pp/config.json` only helps prompts that go through PP. Knowledge helps
*every* session, including ones started from Slack, a ticket, or the API.

```bash
pp playbook --list    # task shapes you have repeated 3+ times
pp playbook           # draft the top one as a Devin Playbook
```

Detection clusters PP's own history by title, objective, verification command,
and file types touched. Playbooks are the one automation step that is purely
defensive — they cut per-session cost without increasing session volume.

## Docs

The full write-up lives in [`docs/`](docs/00-index.md):

| | |
|---|---|
| [ACU cost model](docs/01-acu-cost-model.md) | What you're buying, and why token-thinking misleads |
| [Prompting Devin](docs/02-prompting-devin.md) | The structure, and the smell catalogue |
| [Fixed costs](docs/03-fixed-costs.md) | Snapshots and Knowledge — the biggest lever |
| [Playbooks](docs/04-playbooks.md) | Scripting what you repeat |
| [Automation](docs/05-automation.md) | How far it goes, and the order to do it in |
| [Measurement](docs/06-measurement.md) | Session Insights, and the number that matters |
| [Team setup](docs/07-team-setup.md) | Credentials, onboarding, shared context |
| [PP internals](docs/08-pp-internals.md) | How this tool works |
| [Sources](docs/09-sources.md) | Where each claim came from |
| [Offline mode](docs/10-offline-mode.md) | Building prompts with no API call |
| [Agent workflow plan](docs/11-agent-workflow-plan.md) | Planned next: `pp init`, codebase map, test map, work item contract |

## Sharing credentials with your team

You want Asher using PP without setting up his own Anthropic account or
billing. That works — the piece to get right is that "shared billing" and
"shared secret" are different things, and you only need the first.

**Recommended: one org, one credential each.** In the Anthropic Console, invite
Asher to your organization (or a workspace inside it). He then either runs
`ant auth login`, or gets his own API key issued from that org. Either way the
usage bills to your org, not to him. He never enters payment details.

This costs you nothing extra over a shared key and buys three things: per-person
usage attribution, the ability to revoke one person without breaking everyone
else, and no secret sitting in a chat log. `ant auth login` is the nicer of the
two — it stores a profile in `~/.config/anthropic` that the SDK finds on its
own, so there is no key to paste anywhere and nothing to leak.

**Also fine: one shared API key.** Issue a single key, put it in 1Password or
your team vault, and have each person export it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # in ~/.zshrc
```

It works and it is simple. The tradeoffs are real but survivable for two
people: you cannot tell whose usage is whose, and if it leaks you rotate for
everyone at once.

**Never commit the key.** Not to this repo, not even a private one — keys have
been scraped out of private repos via forks, CI logs, and cloned laptops. There
is deliberately no `apiKey` field in `~/.pp/config.json` for this reason;
`.env` is in `.gitignore` if you prefer that pattern.

Check what a machine is actually using:

```bash
pp --auth      # → credentials: ANTHROPIC_API_KEY / ant auth profile / none
```

## Config

`~/.pp/config.json` — per-repo profiles so you stop retyping context:

```json
{
  "perAcu": 2.25,
  "effort": "medium",
  "defaultRepo": "checkout",
  "standingConstraints": [
    "Follow the patterns already in the touched files; do not introduce new libraries."
  ],
  "repos": [
    {
      "name": "checkout",
      "testCommand": "npm test --",
      "conventions": ["Zod for validation", "no default exports"],
      "offLimits": ["infra/", "generated/"]
    }
  ]
}
```

Set `perAcu` to `2.00` if you're on the Team plan.

## The linter is free

`pp --lint` never calls an API. It catches the expensive patterns on its own:
`NO_PATHS`, `EXPLORE_VERB`, `SCOPE_EXPLOSION`, `DEFERRED_DECISION`,
`VAGUE_IMPROVE`, `OPEN_TAIL`, `NO_ACCEPTANCE`, `NO_VERIFY`, `FULL_SUITE`,
`MULTI_GOAL`, `HEDGE`. Use it as a pre-flight check even on prompts you wrote
by hand.
