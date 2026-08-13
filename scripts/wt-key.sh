#!/usr/bin/env bash
# wt-key.sh — send raw key(s) to a tmux pane WITHOUT auto-submitting.
# Usage: wt-key.sh <pane-id> <key...>
#
# Passthrough to `tmux send-keys -t <pane> <key...>`. Unlike wt-send.sh
# (which types literal text and then presses Enter), this sends key NAMES
# verbatim so the conductor can drive control keys:
#   wt-key.sh %3 Escape          # clear / cancel a stuck prompt
#   wt-key.sh %3 Enter           # submit nothing / accept a default
#   wt-key.sh %3 C-c             # interrupt
#   wt-key.sh %3 Down Down Enter # navigate a menu
#
# Keys are passed straight to tmux, which interprets named keys (Escape,
# Enter, Tab, Up/Down/Left/Right, C-c, M-x, etc.) and sends anything else as
# literal characters. To send a literal string with spaces, quote it and tmux
# will still try to interpret known key names — use wt-send.sh for free text.
set -euo pipefail

PANE="${1:-}"; shift || true
[[ -z "$PANE" || $# -eq 0 ]] && {
  echo "usage: wt-key.sh <pane-id> <key...>   (e.g. wt-key.sh %3 Escape)" >&2
  exit 2
}

tmux send-keys -t "$PANE" "$@"
