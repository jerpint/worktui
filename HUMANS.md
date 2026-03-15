# Worktui Quickstart

Interactive TUI for managing git worktrees + Claude sessions.

## Install

```bash
# 1. Install dependencies
cd ~/worktui
bun install

# 2. Add to your ~/.zshrc
echo 'source ~/worktui/wt.sh' >> ~/.zshrc
source ~/worktui/wt.sh
```

## Usage

```bash
# Interactive (TUI)
wt                                # Launch TUI (worktree list, or project picker)
wt cleanup                        # Jump to cleanup view

# Non-interactive (CLI)
wt list [--json]                  # List worktrees
wt create <branch> [--pr]        # Create worktree (also: wt -b <branch>)
wt delete <branch> [--force] [--branch]  # Delete worktree + optionally its branch
wt sessions [<branch>] [--json]  # List Claude sessions for a worktree
wt projects [--json]             # List registered projects
wt status                        # Current worktree info
wt clean [--dry-run]             # Remove all clean (non-dirty) worktrees
wt remote [--json]               # List remote-only branches
wt pr <branch>                   # Show PR URL for branch
wt help                          # Show help
```

Running `wt` from any git repo automatically registers it so it shows up in the project picker.

## Keybindings

### Project picker

Shown when `wt` is launched outside a git repo.

| Key | Action |
|-----|--------|
| j/k | Navigate |
| / | Fuzzy filter (insert mode) |
| o/Enter | Open project |
| q | Quit |

### Worktree list (home)

| Key | Action |
|-----|--------|
| j/k | Navigate |
| / | Fuzzy filter / create (insert mode) |
| Esc | Back to normal mode |
| h | Back to project picker |
| a | Activate worktree (cd on quit) |
| o | Open shell in worktree (cd) |
| b | Branch — create worktree off selected branch |
| c | New Claude session |
| r | Resume latest Claude session |
| g | GitHub — open PR, or create-PR page if none (repo homepage for main) |
| d | Delete — enter batch delete mode |
| s | Cycle sort (recent/date/branch/status) |
| q | Quit |

### Delete mode

Entered by pressing `d` in the worktree list. Multi-select worktrees for deletion.

| Key | Action |
|-----|--------|
| j/k | Navigate |
| Space | Toggle selected worktree |
| a | Toggle all (non-main) |
| b | Toggle "also delete branches" |
| Enter | Confirm deletion |
| Esc | Cancel |

### Worktree detail (sessions)

| Key | Action |
|-----|--------|
| j/k | Navigate |
| Enter | Select (new session or resume) |
| n | New Claude session |
| r | Resume most recent session |
| o | Open shell in worktree (cd) |
| Esc/h | Back |
| q | Quit |

## Uninstall

Remove `source ~/worktui/wt.sh` from your `~/.zshrc`.
