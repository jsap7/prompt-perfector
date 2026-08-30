# Fixed costs: snapshots and Knowledge

The biggest lever, and the one most teams skip because it isn't as visible as
prompt wording.

**Setup and orientation are paid on every session.** Eliminate them once and
every future session is cheaper forever — including sessions started from
Slack, a ticket, or the API, which no prompt tool ever sees.

## Machine Snapshots

Devin can save a VM state with your dependencies installed and your project
built. Future sessions start from that snapshot instead of rebuilding.

This is a save state: everything downloaded and installed at snapshot time is
present on any future run.

### Why it matters most

If your install-and-build is 8 minutes, you're paying ~0.5 ACU per session to
redo it. That cost is invisible because it looks like normal startup, and it is
completely independent of how good your prompt is.

### What to bake in

- All package installs (`npm ci`, `pip install`, `bundle install`)
- A completed build
- Any local services the tests need
- Credentials and access configuration
- Anything Session Insights' **Action Items** keeps recommending

Re-snapshot when dependencies change materially. A stale snapshot that fails to
build costs more than no snapshot, because Devin then debugs the environment.

## Knowledge

Org- and repo-level persistent context, applied to every session automatically.
This is where orientation cost goes to die.

### What belongs in it

- Architecture and where things live
- Coding standards and conventions
- Build, test, and deploy commands
- Known gotchas and common bugs
- Internal tooling and how to use it
- Scope discipline rules that should apply to every task

### The critical caveat

**Keep it accurate.** The docs are explicit that misleading or outdated
Knowledge causes trial-and-error approaches — stale Knowledge is *worse than
none*, because Devin trusts it and acts on it before discovering it's wrong.

Review it whenever the thing it describes changes. Treat a wrong Knowledge
entry as a production bug.

### Generating it from PP

PP's repo profiles hold exactly this information. Export it:

```bash
pp knowledge      # prints entries, copies to clipboard
```

Then paste each into **app.devin.ai → Settings → Knowledge**.

The reason to move it out of PP: `~/.pp/config.json` only helps prompts that go
through PP. Knowledge helps *every* session, including automated ones. Same
information, far wider blast radius.

## Ask Devin

Codebase Q&A for scoping work *before* starting a session. Cheaper than opening
a session to find out where something lives — use it to answer the questions PP
flags as gaps, then feed the answers into the prompt.
