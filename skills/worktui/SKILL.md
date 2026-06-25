---
name: worktui
description: Spin up and drive isolated Claude work sessions in tmux + git worktrees via worktui. Use when the user says things like "let's work on X next", "spawn a session for <branch>", "orchestrate these sessions", "set up a worktree session", or wants to start, drive, observe, or tear down per-branch Claude sessions. Requires running inside tmux.
---

# worktui

Orchestrate isolated work sessions. Each session = one `wt` (worktui) worktree + one tmux
tab split into a **seeded Claude pane** and a **shell pane**. You are the conductor: spawn,
seed, send tasks, read output, tear down — all from your own session via these scripts.

All orchestration runs through the single `wt` command, so one permission grant
(`Bash(wt:*)`) covers spawn/send/read/kill — you won't be prompted per call.

**Prerequisites:**
- **worktui must be installed** and `wt` on PATH (`bun link` in `~/worktui`).
  If `wt` isn't available, none of this works. See `~/worktui/HUMANS.md` for setup.
- **Must be running inside tmux** — `wt` drives the tmux server to open tabs/panes.

## 1. Spawn a session

Run from inside the target repo — CWD decides which project's worktree is created
(or set `WT_REPO=/path/to/repo`):

```bash
wt spawn <branch> <context describing the work>
# optional live pane on the right instead of a shell:
wt spawn --right "pnpm dev" <branch> <context...>
```

Parse the `KEY=VALUE` output and **remember the handles** for the rest of the conversation:

```
WT_BRANCH / WT_PATH / WT_WINDOW / WT_CLAUDE_PANE / WT_SHELL_PANE
```

The Claude pane boots seeded with the context and stands by for instructions.

## 2. Drive it

```bash
wt send <WT_CLAUDE_PANE> "your instruction"   # type + submit
wt read <WT_CLAUDE_PANE> [lines]              # read its output back
```

Typical loop: **send a task → wait a few seconds → read → react → send follow-up.**
The child Claude may be in accept-edits mode; only send tasks the user has approved.

## 3. Inspect

```bash
tmux list-windows -F '#{window_index}: #{window_name} (#{window_panes} panes)'
```

## 4. Tear down

```bash
wt kill <branch>              # close the tab only
wt kill <branch> --worktree   # + remove the worktree
wt kill <branch> --branch     # + remove the worktree and its branch
```

## Conventions

- Track active sessions (branch → pane ids → what they're working on) and report them to the user.
- **Never** pipe real secrets through `wt send` — they land in the tmux buffer and scrollback.
- Confirm with the user before sending tasks that mutate a worktree.
- You only "see" what's rendered in a pane (visible + scrollback via `wt-read`), not the child's internal context.
