#!/usr/bin/env bash
# wt-kill.sh — tear down an orchestrated session: close the tmux tab,
# and optionally remove the worktree (and its branch).
#
# Usage:
#   wt-kill.sh <branch>              # close the tmux tab only
#   wt-kill.sh <branch> --worktree   # + remove the worktree
#   wt-kill.sh <branch> --branch     # + remove the worktree and its branch
#
# Env: WORKTUI_SRC (default ~/worktui/src/index.tsx), WT_REPO (default $PWD)
set -euo pipefail

WORKTUI_SRC="${WORKTUI_SRC:-$HOME/worktui/src/index.tsx}"
DEL_WT=0; DEL_BR=0; BRANCH=""

for a in "$@"; do
  case "$a" in
    --worktree) DEL_WT=1 ;;
    --branch)   DEL_WT=1; DEL_BR=1 ;;
    *)          [[ -z "$BRANCH" ]] && BRANCH="$a" ;;
  esac
done
[[ -z "$BRANCH" ]] && { echo "usage: wt-kill.sh <branch> [--worktree|--branch]" >&2; exit 2; }

WNAME="$(printf '%s' "$BRANCH" | tr '/ ' '--')"
if tmux list-windows -F '#{window_name}' | grep -qx "$WNAME"; then
  tmux kill-window -t "$WNAME"
  echo "killed tmux window: $WNAME"
else
  echo "no tmux window named: $WNAME"
fi

if [[ "$DEL_WT" == 1 ]]; then
  if [[ "$DEL_BR" == 1 ]]; then
    (cd "${WT_REPO:-$PWD}" && bun run "$WORKTUI_SRC" delete "$BRANCH" --branch)
  else
    (cd "${WT_REPO:-$PWD}" && bun run "$WORKTUI_SRC" delete "$BRANCH")
  fi
fi
