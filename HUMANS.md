# Claudioscope Quickstart

Interactive TUI for managing git worktrees + Claude sessions.

## Install

```bash
# 1. Install dependencies
cd ~/claudioscope
bun install

# 2. Add to your ~/.zshrc
echo 'source ~/claudioscope/wt.sh' >> ~/.zshrc
source ~/claudioscope/wt.sh
```

## Usage

```bash
wt                            # Launch TUI
wt -b feature/my-branch       # Create worktree (CLI mode)
wt -b feature/my-branch --pr  # Create worktree + draft PR
wt cleanup                    # Jump to cleanup view
```

## Keybindings

### Worktree list (home)

| Key | Action |
|-----|--------|
| j/k | Navigate |
| Enter | Open worktree detail |
| o | Open shell in worktree (cd) |
| / | Fuzzy filter (insert mode) |
| Esc | Back to normal mode |
| c | Create worktree |
| d | Delete worktree |
| x | Cleanup (multi-select) |
| s | Cycle sort (date/branch/status) |
| r | Refresh |
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

Remove `source ~/claudioscope/wt.sh` from your `~/.zshrc`.
