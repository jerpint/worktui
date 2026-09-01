---
name: worktui
description: Manage git worktrees and spin up / drive isolated Claude work sessions via worktui (`wt`). Use when the user wants to create, list, or clean up git worktrees for parallel branches, OR to spawn, drive, observe, or tear down per-branch Claude sessions ("let's work on X next", "spawn a session for <branch>", "orchestrate these sessions", "set up a worktree"). The session-orchestration verbs require running inside tmux; plain worktree management does not.
---

# worktui

`wt` does two things:

1. **Manage git worktrees** — isolated per-branch working directories, so you can work on
   several branches in parallel without collisions (see *Worktree management* below).
2. **Orchestrate work sessions** — each session = one worktree + one tmux tab split into a
   **seeded Claude pane** and a **shell pane**. You are the conductor: spawn, seed, send tasks,
   read output, tear down — all from your own session (sections 1–4).

Everything runs through the single `wt` command, so one permission grant (`Bash(wt:*)`) covers
all of it — you won't be prompted per call.

**Prerequisites:**
- **worktui must be installed** and `wt` on PATH (`bun link` in `~/worktui`).
  If `wt` isn't available, none of this works. See `~/worktui/HUMANS.md` for setup.
- **The orchestration verbs (spawn/send/read/kill) must run inside tmux** — `wt` drives the tmux
  server to open tabs/panes. Plain worktree management (create/list/delete/…) works anywhere.

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

## Worktree management

For everyday parallel-branch work (no tmux needed), `wt` manages the worktrees themselves — each
branch gets its own isolated directory:

```bash
wt create <branch> [--pr]        # create a worktree for a branch (+ optional draft PR); cd's you in
wt list [--json]                 # list worktrees
wt status                        # info about the current worktree
wt sessions [<branch>] [--json]  # Claude sessions for a worktree
wt delete <branch> [--branch]    # remove a worktree (+ optionally its branch)
wt clean [--dry-run]             # remove all clean (non-dirty) worktrees
wt remote [--json]               # remote branches without a local worktree
wt projects [--json]             # registered projects
wt pr <branch>                   # show the PR URL for a branch
wt main [--force]                # put the default branch back in the primary repo; cd's you in
wt doctor [--fix] [--force]      # check (and repair) the worktree layout
```

**The default branch lives in the primary repo, never in a linked worktree.** Git refuses to
check out a branch that's already checked out somewhere else, so parking `main` under
`~/.worktui` would lock the primary clone out of `main` permanently. `wt create main` therefore
doesn't create a worktree — it sends you to the primary repo. If a repo is already in that
broken state (primary stranded on some straggling branch), `wt doctor --fix` repairs it:
it evicts `main` from the linked worktree, checks it out in the primary, and gives the displaced
branch its own worktree so unmerged commits don't vanish from `wt list`. `wt main` does the same
and drops you in the primary.

Both refuse rather than discard: if the worktree holding `main` is dirty, or the primary has
uncommitted tracked changes, you get an error naming the path. `--force` overrides (and discards).

Run `wt` with no arguments for the interactive TUI (navigate with j/k), or `wt help` for the full
reference. Every command supports `--json` for machine-readable output.

## Conventions

- Track active sessions (branch → pane ids → what they're working on) and report them to the user.
- **Never** pipe real secrets through `wt send` — they land in the tmux buffer and scrollback.
- Confirm with the user before sending tasks that mutate a worktree.
- You only "see" what's rendered in a pane (visible + scrollback via `wt-read`), not the child's internal context.
