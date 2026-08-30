# Team setup

## Credentials for PP

PP calls the Anthropic API to rewrite prompts. It resolves credentials the way
the SDK does, in order: `ANTHROPIC_API_KEY`, then `ANTHROPIC_AUTH_TOKEN`, then
an `ant auth login` OAuth profile in `~/.config/anthropic`, then Workload
Identity Federation.

Check what a machine is using:

```bash
pp --auth        # → credentials: ANTHROPIC_API_KEY / ant auth profile / none
```

### Sharing without sharing a secret

"Shared billing" and "shared secret" are different things, and you only need
the first.

**Recommended — one org, one credential each.** Invite each person to your
Anthropic organization in the Console. They run `ant auth login` or get a key
issued from that org. Usage bills to the org; nobody enters payment details.

Costs nothing over a shared key and buys three things: per-person usage
attribution, revoking one person without breaking everyone, and no secret in a
chat log. `ant auth login` is the better half — it writes a profile the SDK
finds on its own, so there's no key to paste and nothing to leak.

**Also fine — one shared API key.** Issue one, put it in a team vault, each
person exports it. Simple. You lose attribution, and a leak means rotating for
everyone.

### Never commit the key

Not to any repo, not even a private one — keys get scraped via forks, CI logs,
and cloned laptops. There is deliberately **no `apiKey` field** in
`~/.pp/config.json` for this reason. `.env` is gitignored.

### One trap worth knowing

An **empty but exported** `ANTHROPIC_API_KEY` still shadows every other
credential source. `export ANTHROPIC_API_KEY=` will block an otherwise working
`ant auth login` profile and produce a confusing "no credentials" error. If
auth misbehaves, check for an empty export before anything else:

```bash
grep -n 'ANTHROPIC_API_KEY' ~/.zshrc
```

(We hit this one for real — a `.env.example` placeholder got copied in.)

## Shared Devin context

Per-person config does not scale. Anything true for the team belongs where the
team's sessions can see it:

| Thing | Where it belongs |
|---|---|
| Conventions, architecture, gotchas | Devin **Knowledge** |
| Repeated procedures | Devin **Playbooks** |
| Environment setup | **Machine snapshot** |
| Prompt drafting | PP, per person |

PP's `~/.pp/config.json` is a staging area, not the destination. Run
`pp knowledge` to move it into Devin where every session benefits — including
the automated ones PP never sees.

## Onboarding someone new

1. Invite to the Anthropic org; they run `ant auth login`.
2. Clone this repo, `npm install && npm run build && npm link`.
3. Add `alias pp="ppf"` — homebrew's `nss` owns `/opt/homebrew/bin/pp`.
4. `pp --auth` to confirm.
5. Read [00-index.md](00-index.md), then [01](01-acu-cost-model.md) and
   [02](02-prompting-devin.md).
6. Copy a `~/.pp/config.json` repo profile from someone who has one.
