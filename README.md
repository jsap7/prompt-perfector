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

```bash
npm install
npm run build
npm link          # installs `ppf`
export ANTHROPIC_API_KEY=sk-ant-...
```

Homebrew's `nss` package already owns a binary called `pp` (an ASN.1
pretty-printer). Rather than clobber a brew-managed symlink — brew would
restore it on the next upgrade and break the command — PP installs as `ppf`
and an alias gives you the short name in your own shell:

```bash
alias pp="ppf"    # already added to ~/.zshrc
```

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
