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
- **Repo-agnostic** — detects git root from CWD
- **Fast by default** — parallel dirty checks, session index fast path
- **Vim navigation** — j/k/h/l throughout all views
- **Resume flow** — drill into worktree, select session, drop into `claude --resume`
