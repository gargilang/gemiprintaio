---
name: rtk
description: "Use when running noisy shell commands (build, test, lint, type-check, git, install, large file/dir listing) so the output is compressed 60-90% before it reaches the model context. In Zed rtk is NOT automatic — prefix the command with `rtk` yourself."
---

# rtk — token-saving CLI proxy

`rtk` runs a normal CLI command, then filters/compresses its output (typically 60-90% fewer tokens) before it reaches the model, while still saving the full output to a `tee` log so nothing is lost on failure.

## IMPORTANT: in Zed, rtk is manual

In Cursor and OpenCode, rtk rewrites commands automatically via a pre-tool hook/plugin. **Zed has no equivalent pre-tool hook**, so nothing rewrites commands for you here. To get the savings you must type `rtk` yourself in front of the command.

There is no Zed target in `rtk init` (only claude/cursor/windsurf/cline/kilocode/antigravity/pi/hermes), so do not try to "install" an automatic hook for Zed — just invoke `rtk` directly.

## When to reach for it

Prefix with `rtk` whenever a command tends to produce long, repetitive, or boilerplate-heavy output:

- Build / compile: `rtk npm run build`, `rtk next build`, `rtk tsc`, `rtk cargo build`
- Tests: `rtk jest <path>`, `rtk vitest`, `rtk pytest`, `rtk test <cmd>`
- Lint / format / types: `rtk lint`, `rtk eslint`, `rtk tsc`, `rtk prettier`, `rtk mypy`, `rtk ruff`
- Type-check in this repo: `rtk npm run type-check`
- Install: `rtk npm install`, `rtk pip install ...`
- Git (read-only, compact): `rtk git status`, `rtk git diff`, `rtk git log`
- GitHub / GitLab CLI: `rtk gh ...`, `rtk glab ...`
- Listing / searching big trees: `rtk ls`, `rtk tree`, `rtk find -name ...`, `rtk grep ...`
- Logs: `rtk log <file>`, `rtk err <cmd>` (errors/warnings only)

For a short, cheap command (one file read, a quick `echo`, a single fast command) just run it directly — wrapping trivial output in rtk adds no value.

## Rules

- Don't fight the compact output. If the result looks intentionally terse, that's rtk doing its job.
- On failure, rtk prints a `[full output: …/tee/…log]` path. Read that log for the unfiltered detail instead of re-running the raw command.
- When you genuinely need raw, byte-for-byte output (debugging rtk itself, exact formatting): use `rtk proxy <cmd>` (tracked) or `rtk run <cmd>` (raw, untracked).
- Pipe mode: `… | rtk pipe` filters arbitrary stdin.
- Analytics are on-demand: `rtk gain` (savings summary), `rtk gain --history`, `rtk discover` (missed opportunities).
- rtk is already installed at `~/.local/bin/rtk`. If a command ever reports `rtk: not found`, just run the command without the `rtk` prefix.

## Quick reference

```
rtk <subcommand> [args]     # filtered + tracked (the normal case)
rtk proxy <cmd>             # no filtering, still tracked
rtk run <cmd>              # raw sh -c, no filtering, no tracking
rtk pipe                   # filter stdin (Unix pipe)
rtk gain [--history]       # token-savings analytics
rtk help <subcommand>      # per-command help
```

Common subcommands: `ls tree read find grep git gh glab npm npx tsc next jest vitest lint prettier eslint pytest ruff mypy cargo go docker kubectl psql diff log err test`.
