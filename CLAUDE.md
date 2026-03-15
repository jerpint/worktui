# Worktui

Worktree management TUI with Claude session integration.

## Tech Stack

- **Runtime**: Bun
- **TUI**: Ink (React for CLIs)
- **Language**: TypeScript

## Project Structure

```
src/
  index.tsx               # Entry: route to CLI or TUI
  cli.ts                  # CLI subcommands (list, create, delete, sessions, etc.)
  types.ts                # Worktree, ClaudeSession, Project, View types
  git.ts                  # All git operations via Bun.spawn
  sessions.ts             # Claude session discovery (~/.claude/projects/)
  projects.ts             # Project discovery (~/.worktui/ subdirs)
  utils.ts                # relativeTime, truncate, path encoding
  access.ts               # Last-accessed timestamps per worktree
  components/
    App.tsx               # View router + global keybindings
    WorktreeList.tsx      # Home: project picker OR worktree list
    WorktreeDetail.tsx    # Drill-down: Claude sessions for a worktree
    CreateWorktree.tsx    # Text input for new branch name
    DeleteConfirm.tsx     # Confirmation dialog
    Cleanup.tsx           # Multi-select cleanup
    StatusBar.tsx         # Bottom keybinding hints
```

## Usage

```bash
# TUI (interactive)
wt                                # Launch TUI (worktree list, or project picker)
wt cleanup                        # Launch TUI directly into cleanup view

# CLI (scriptable, non-interactive)
wt list [--json]                  # List worktrees
wt create <branch> [--pr]        # Create worktree (alias: -b)
wt delete <branch> [--force] [--branch]  # Delete worktree
wt sessions [<branch>] [--json]  # List Claude sessions
wt projects [--json]             # List registered projects
wt status                        # Current worktree info
wt clean [--dry-run]             # Remove all clean worktrees
wt remote [--json]               # List remote-only branches
wt pr <branch>                   # Show PR URL for branch
wt help                          # Show help
```

## Setup

- `brew install oven-sh/bun/bun` — install bun
- `bun install` — install dependencies
- `bun link` — make `worktree` available globally
- `bun run start` — launch the TUI

## Key Files

- `context.md` — analysis of the ~/.claude/ filesystem structure
- `HUMANS.md` — user-facing quickstart & keybinding reference. Keep it in sync when changing keybindings or usage.

## Design Principles

- **Two modes** — CLI subcommands for scripting, TUI mode for interactive use
- **Repo-agnostic** — detects git root from CWD, worktrees live in `~/.worktui/<project>/` (override with `WORKTUI_DIR`)
- **Fast by default** — parallel dirty checks, session index fast path
- **Vim navigation** — j/k/h/l throughout all views
- **Resume flow** — drill into worktree, select session, drop into `claude --resume`

## Architecture

### Data Flow
```
index.tsx (entry)
  ├─ cli.ts → runCLI(args)
  │   ├─ list/create/delete/sessions/projects/status/clean/remote/pr
  │   │   → reuses git.ts, sessions.ts, projects.ts, access.ts
  │   │   → stdout output (tables or JSON)
  │   └─ returns false if not a CLI command
  │
  └─ TUI mode: render <App>
      └─ App (view router, View state machine)
          ├─ WorktreeList → git.listWorktrees() OR projects.listProjects()
          ├─ WorktreeDetail → sessions.getSessions()
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
Project { name, path, worktreeCount }
View = "list" | "detail" | "create" | "delete" | "cleanup"
LaunchTarget = { kind: "claude" | "shell", cwd, sessionId? }
```

### Project Picker Keybindings (Normal Mode)
Shown when `wt` is launched outside a git repo. Lists all registered projects under `~/.worktui/`.
Projects are auto-registered when you run `wt` from any git repo.

| Key | Action |
|-----|--------|
| j/k | Navigate down/up |
| / | Filter (enter insert mode) |
| o/Enter | Open project |
| q | Quit |

### WorktreeList Keybindings (Normal Mode)
| Key | Action |
|-----|--------|
| j/k | Navigate down/up |
| / | Filter/create (enter insert mode) |
| h | Back to project picker |
| a | Activate worktree (chdir) |
| o | Open shell in worktree |
| b | Branch off selected worktree |
| c | New Claude session |
| r | Resume latest Claude session |
| g | GitHub — open PR (or create-PR page if none), repo homepage for main |
| d | Delete worktree |
| s | Cycle sort (recent/date/branch/status) |
| q | Quit |

### git.ts Exports
- `getGitRoot(cwd?)` — resolve repo root via `--git-common-dir`
- `isDirty(path)` — unstaged + staged + untracked check
- `listWorktrees(gitRoot)` — porcelain parse + parallel metadata enrichment
- `createWorktree(gitRoot, branch)` — creates worktree at `$WORKTUI_DIR/<project>/<branch>` (default `~/.worktui/`), handles local/remote/new branch cases, copies `.claude/settings.local.json`
- `removeWorktree`, `deleteBranch`, `fetchRemote`, `listRemoteBranches`
- `getPRUrl(cwd, branch)` — get GitHub PR URL via `gh pr view`
- `getRepoUrl(cwd)` — get GitHub repo URL via `gh repo view`
- `createDraftPR(cwd, branch)` — push + `gh pr create --draft --fill`

### projects.ts Exports
- `listProjects()` — reads `~/.worktui/` subdirs, returns `Project[]` sorted by mtime

### Component Patterns
- **StatusBar**: each view builds `hints: {key, label}[]` and passes to `<StatusBar />`
- **Vim modes**: WorktreeList has insert/normal modes with fuzzy filtering
- **Project mode**: WorktreeList falls back to a project picker when `getGitRoot()` fails. A `.gitroot` file in each project dir maps back to the original repo.
- **Parallel loading**: `listWorktrees` runs isDirty + commitInfo + sessionInfo concurrently per worktree
- **Theme**: Nord palette in `theme.ts`, used via `theme.selected`, `theme.dim`, etc.
