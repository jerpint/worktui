# Worktui

Worktree management TUI with Claude session integration.

## Tech Stack

- **Runtime**: Bun
- **TUI**: Ink (React for CLIs)
- **Language**: TypeScript

## Project Structure

```
src/
  index.tsx               # Entry: parse args, CLI mode or TUI mode
  types.ts                # Worktree, ClaudeSession, View types
  git.ts                  # All git operations via Bun.spawn
  sessions.ts             # Claude session discovery (~/.claude/projects/)
  utils.ts                # relativeTime, truncate, path encoding
  components/
    App.tsx               # View router + global keybindings
    WorktreeList.tsx      # Home: list all worktrees
    WorktreeDetail.tsx    # Drill-down: Claude sessions for a worktree
    CreateWorktree.tsx    # Text input for new branch name
    DeleteConfirm.tsx     # Confirmation dialog
    Cleanup.tsx           # Multi-select cleanup
    StatusBar.tsx         # Bottom keybinding hints
```

## Usage

```bash
worktree                          # Launch TUI (home = worktree list)
worktree -b feature/my-branch     # CLI: create worktree, print path, exit
worktree -b feature/my-branch --pr  # CLI: create worktree + draft PR, exit
worktree cleanup                  # Launch TUI directly into cleanup view
```

## Setup

- `brew install oven-sh/bun/bun` — install bun
- `bun install` — install dependencies
- `bun link` — make `worktree` available globally
- `bun run start` — launch the TUI

## Key Files

- `context.md` — analysis of the ~/.claude/ filesystem structure

## Design Principles

- **Two modes** — CLI mode (`-b`) for scripting, TUI mode for interactive use
- **Repo-agnostic** — detects git root from CWD, worktrees live in `~/.worktrees/<project>/` (override with `WORKTUI_DIR`)
- **Fast by default** — parallel dirty checks, session index fast path
- **Vim navigation** — j/k/h/l throughout all views
- **Resume flow** — drill into worktree, select session, drop into `claude --resume`

## Architecture

### Data Flow
```
index.tsx (CLI entry)
  ├─ CLI mode: -b branch [--pr]
  │   → git.createWorktree() + git.createDraftPR()
  │   → write /tmp/worktui-launch → exit
  │
  └─ TUI mode: render <App>
      └─ App (view router, View state machine)
          ├─ WorktreeList → git.listWorktrees() + keybindings
          ├─ WorktreeDetail → sessions.getSessions()
          ├─ FetchBranch → git.fetchRemote() + git.listRemoteBranches()
          ├─ Cleanup → git.removeWorktree() bulk
          └─ DeleteConfirm → git.removeWorktree() + git.deleteBranch()
```

### Launch Pattern
The TUI can't own the terminal after launching a subprocess, so:
1. `onLaunch(target)` → unmount the TUI
2. Write JSON `{ kind, cwd, sessionId? }` to `/tmp/worktui-launch`
3. Shell wrapper `wt.sh` reads the file and runs `cd + $SHELL` or `claude --resume`

For non-blocking ops like opening a URL, spawn directly (e.g. `Bun.spawn(["open", url])`) — no need to unmount.

### Key Types
```typescript
Worktree { path, branch, head, commitSubject, commitDate, isDirty, isMain, sessionCount, lastSessionSummary }
ClaudeSession { sessionId, firstPrompt, summary, messageCount, created, modified, gitBranch }
View = "list" | "detail" | "create" | "delete" | "cleanup" | "fetch"
LaunchTarget = { kind: "claude" | "shell", cwd, sessionId? }
```

### git.ts Exports
- `getGitRoot(cwd?)` — resolve repo root via `--git-common-dir`
- `isDirty(path)` — unstaged + staged + untracked check
- `listWorktrees(gitRoot)` — porcelain parse + parallel metadata enrichment
- `createWorktree(gitRoot, branch)` — creates worktree at `$WORKTUI_DIR/<project>/<branch>` (default `~/.worktrees/`), handles local/remote/new branch cases, copies `.claude/settings.local.json`
- `removeWorktree`, `deleteBranch`, `fetchRemote`, `listRemoteBranches`
- `getPRUrl(cwd, branch)` — get GitHub PR URL via `gh pr view`
- `createDraftPR(cwd, branch)` — push + `gh pr create --draft --fill`

### Component Patterns
- **StatusBar**: each view builds `hints: {key, label}[]` and passes to `<StatusBar />`
- **Vim modes**: WorktreeList + FetchBranch have insert/normal modes with fuzzy filtering
- **Parallel loading**: `listWorktrees` runs isDirty + commitInfo + sessionInfo concurrently per worktree
- **Theme**: Nord palette in `theme.ts`, used via `theme.selected`, `theme.dim`, etc.
