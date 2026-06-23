#!/usr/bin/env bash
# wt-read.sh — capture a tmux pane's visible buffer + scrollback.
# Usage: wt-read.sh <pane-id> [lines=200]
set -euo pipefail

PANE="${1:-}"
LINES="${2:-200}"
[[ -z "$PANE" ]] && { echo "usage: wt-read.sh <pane-id> [lines]" >&2; exit 2; }

tmux capture-pane -t "$PANE" -p -S "-${LINES}"
