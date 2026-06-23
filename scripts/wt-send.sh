#!/usr/bin/env bash
# wt-send.sh — type a line into a tmux pane (e.g. a Claude session) and submit it.
# Usage: wt-send.sh <pane-id> <text...>
set -euo pipefail

PANE="${1:-}"; shift || true
TEXT="$*"
[[ -z "$PANE" ]] && { echo "usage: wt-send.sh <pane-id> <text...>" >&2; exit 2; }

tmux send-keys -t "$PANE" -l -- "$TEXT"
sleep 0.2
tmux send-keys -t "$PANE" Enter
