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
wt                            # Launch TUI (worktree list, or project picker if outside a git repo)
wt -b feature/my-branch       # Create worktree (CLI mode)
wt -b feature/my-branch --pr  # Create worktree + draft PR
wt cleanup                    # Jump to cleanup view
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
| c | New Claude session |
| r | Resume latest Claude session |
| g | GitHub — open PR, or create-PR page if none (repo homepage for main) |
| f | Fetch remote branch |
| d | Delete worktree |
| s | Cycle sort (recent/date/branch/status) |
| q | Quit |

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
