#!/usr/bin/env bash
# wt-spawn.sh — create a worktui worktree, open a tmux tab split into
# [ Claude (seeded) | shell ], and print machine-readable pane handles.
#
# Usage:
#   wt-spawn.sh <branch> [context...]
#   wt-spawn.sh --right "pnpm dev" <branch> [context...]
#
# Env:
#   WORKTUI_SRC  worktui entry point (default ~/worktui/src/index.tsx)
#   WT_REPO      repo dir to create the worktree from (default: $PWD)
#
# Output (stdout, KEY=VALUE — easy to parse):
#   WT_BRANCH / WT_PATH / WT_WINDOW / WT_CLAUDE_PANE / WT_SHELL_PANE
set -euo pipefail

WORKTUI_SRC="${WORKTUI_SRC:-$HOME/worktui/src/index.tsx}"
RIGHT_CMD=""

while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --right) RIGHT_CMD="${2:-}"; shift 2 ;;
    --) shift; break ;;
    *) echo "wt-spawn: unknown flag: $1" >&2; exit 2 ;;
  esac
done

BRANCH="${1:-}"
[[ -z "$BRANCH" ]] && { echo "usage: wt-spawn.sh [--right CMD] <branch> [context...]" >&2; exit 2; }
shift || true
CONTEXT="$*"

command -v bun >/dev/null || { echo "wt-spawn: bun not found" >&2; exit 1; }
# Require a reachable tmux server (don't depend on $TMUX being exported — it
# isn't always present in non-interactive shells, but the socket still works).
SESSION="$(tmux display-message -p '#{session_name}' 2>/dev/null)" \
  || { echo "wt-spawn: no tmux server reachable (run inside tmux)" >&2; exit 1; }

REPO="${WT_REPO:-$PWD}"

# 1. create worktree (idempotent) — first stdout line is the path
WT_PATH="$(cd "$REPO" && bun run "$WORKTUI_SRC" create "$BRANCH" | head -1)"
[[ -d "$WT_PATH" ]] || { echo "wt-spawn: worktree path not found: $WT_PATH" >&2; exit 1; }

# 2. seed the prompt via tmux's session environment. tmux handles the quoting
# (we just pass "$PROMPT"); panes created next inherit it as a plain env var.
# The value is never re-parsed as shell — Claude receives it as a single argument.
PROMPT="We are working in the worktui-managed worktree for branch '$BRANCH' (path: $WT_PATH)."
[[ -n "$CONTEXT" ]] && PROMPT="$PROMPT Context: $CONTEXT."
PROMPT="$PROMPT Acknowledge this context and stand by — make no changes until I give you a task."
tmux set-environment -t "$SESSION" WT_SPAWN_PROMPT "$PROMPT"
# Name the Claude session after its branch (shows in session picker + terminal title).
tmux set-environment -t "$SESSION" WT_SPAWN_NAME "$BRANCH"

# 3. new tmux window (tab), detached so the caller keeps focus
WNAME="$(printf '%s' "$BRANCH" | tr '/ ' '--')"
read -r WIN CLAUDE_PANE < <(tmux new-window -d -t "$SESSION:" -n "$WNAME" -c "$WT_PATH" \
  -P -F '#{window_index} #{pane_id}' "exec ${SHELL:-/bin/zsh}")
# Tag the pane as a worktui agent so wt-fleet can find it reliably (this survives
# the pane's running command changing while Claude shells out to tools).
tmux set-option -p -t "$CLAUDE_PANE" @wt_agent "$BRANCH"

# 4. split → right pane (shell, or a watcher via --right)
if [[ -n "$RIGHT_CMD" ]]; then
  SHELL_PANE="$(tmux split-window -h -d -c "$WT_PATH" -t "$CLAUDE_PANE" \
    -P -F '#{pane_id}' "$RIGHT_CMD; exec ${SHELL:-/bin/zsh}")"
else
  SHELL_PANE="$(tmux split-window -h -d -c "$WT_PATH" -t "$CLAUDE_PANE" \
    -P -F '#{pane_id}' "exec ${SHELL:-/bin/zsh}")"
fi

# 5. boot Claude in the left pane; it expands the inherited env vars itself.
tmux send-keys -t "$CLAUDE_PANE" 'claude --name "$WT_SPAWN_NAME" "$WT_SPAWN_PROMPT"' Enter
# Clear them from the session env so they don't leak into later panes
# (the pane's shell already has its own inherited copies).
tmux set-environment -t "$SESSION" -u WT_SPAWN_PROMPT
tmux set-environment -t "$SESSION" -u WT_SPAWN_NAME

# 6. emit handles
printf 'WT_BRANCH=%s\n'       "$BRANCH"
printf 'WT_PATH=%s\n'         "$WT_PATH"
printf 'WT_WINDOW=%s\n'       "$WIN"
printf 'WT_CLAUDE_PANE=%s\n'  "$CLAUDE_PANE"
printf 'WT_SHELL_PANE=%s\n'   "$SHELL_PANE"
