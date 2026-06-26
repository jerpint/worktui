#!/usr/bin/env bash
# wt-read.sh — capture a tmux pane's visible buffer + scrollback.
# Usage: wt-read.sh <pane-id> [lines=200]
#
# Robustness contract (Phase 1): this is the conductor's eyes — it MUST NOT
# throw. We deliberately do NOT use `set -e`: a failed capture (dead pane,
# stale id) prints a warning to stderr and an empty buffer to stdout, exit 0.
# `-J` joins wrapped lines so prompt boxes / long lines read back intact.
set -uo pipefail

PANE="${1:-}"
LINES="${2:-200}"
[[ -z "$PANE" ]] && { echo "usage: wt-read.sh <pane-id> [lines]" >&2; exit 2; }

# Primary: last $LINES lines of scrollback, wrapped lines joined (-J).
if out="$(tmux capture-pane -t "$PANE" -p -J -S "-${LINES}" 2>/dev/null)"; then
  printf '%s\n' "$out"
  exit 0
fi

# Fallback: whole scrollback (some tmux versions reject the negative -S form
# in odd states). Still join wrapped lines.
if out="$(tmux capture-pane -t "$PANE" -p -J -S - 2>/dev/null)"; then
  printf '%s\n' "$out"
  exit 0
fi

# Last resort: visible region only.
if out="$(tmux capture-pane -t "$PANE" -p 2>/dev/null)"; then
  printf '%s\n' "$out"
  exit 0
fi

echo "wt-read: could not capture pane '$PANE' (gone or unreachable)" >&2
exit 0
