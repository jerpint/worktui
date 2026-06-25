---
name: worktui
description: Spin up and drive isolated Claude work sessions in tmux + git worktrees via worktui. Use when the user says things like "let's work on X next", "spawn a session for <branch>", "orchestrate these sessions", "set up a worktree session", or wants to start, drive, observe, or tear down per-branch Claude sessions. Requires running inside tmux.
---

# worktui

Orchestrate isolated work sessions. Each session = one `wt` (worktui) worktree + one tmux
tab split into a **seeded Claude pane** and a **shell pane**. You are the conductor: spawn,
seed, send tasks, read output, tear down — all from your own session via these scripts.

**Prerequisites:**
- **worktui must be installed** at `~/worktui` — the scripts call `bun run ~/worktui/src/index.tsx`
  to create/delete worktrees. If `~/worktui` is missing or `bun` isn't on PATH, none of this works.
  See `~/worktui/HUMANS.md` for setup (`bun install` + source `wt.sh`).
- **Must be running inside tmux** — the scripts drive the tmux server to open tabs/panes.
- Scripts live in `~/worktui/scripts/`.

## 1. Spawn a session

Run from inside the target repo — CWD decides which project's worktree is created
(or set `WT_REPO=/path/to/repo`):

```bash
~/worktui/scripts/wt-spawn.sh <branch> <context describing the work>
# optional live pane on the right instead of a shell:
~/worktui/scripts/wt-spawn.sh --right "pnpm dev" <branch> <context...>
```

Parse the `KEY=VALUE` output and **remember the handles** for the rest of the conversation:

```
WT_BRANCH / WT_PATH / WT_WINDOW / WT_CLAUDE_PANE / WT_SHELL_PANE
```

The Claude pane boots seeded with the context and stands by for instructions.

## 2. Drive it

```bash
~/worktui/scripts/wt-send.sh <WT_CLAUDE_PANE> "your instruction"   # type + submit
~/worktui/scripts/wt-read.sh <WT_CLAUDE_PANE> [lines]             # read its output back
```

Typical loop: **send a task → wait a few seconds → read → react → send follow-up.**
The child Claude may be in accept-edits mode; only send tasks the user has approved.

## 3. Inspect

```bash
tmux list-windows -F '#{window_index}: #{window_name} (#{window_panes} panes)'
```

## 4. Tear down

```bash
~/worktui/scripts/wt-kill.sh <branch>              # close the tab only
~/worktui/scripts/wt-kill.sh <branch> --worktree   # + remove the worktree
~/worktui/scripts/wt-kill.sh <branch> --branch     # + remove the worktree and its branch
```

## Conventions

- Track active sessions (branch → pane ids → what they're working on) and report them to the user.
- **Never** pipe real secrets through `wt-send` — they land in the tmux buffer and scrollback.
- Confirm with the user before sending tasks that mutate a worktree.
- You only "see" what's rendered in a pane (visible + scrollback via `wt-read`), not the child's internal context.
