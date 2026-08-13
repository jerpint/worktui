#!/usr/bin/env bash
# wt-approve.sh — answer a Claude permission dialog with the affirmative.
# Usage: wt-approve.sh <pane-id> [--force]
#
# Safety: by default we first confirm (via wt-state.sh) that a permission
# prompt is actually present. If not, we no-op with a clear message rather
# than blindly pressing keys into whatever has focus. Pass --force to skip the
# check (e.g. if the classifier is mid-transition and you know better).
#
# KEY-MAPPING ASSUMPTIONS (Claude Code v2.1.170, locked against live frames):
#   The permission box renders a numbered menu with the affirmative first and
#   pre-selected:
#       ❯ 1. Yes
#         2. Yes, and always allow access to … from this project
#         3. No
#   "1" is always the plain affirmative ("Yes" — approve this once, do NOT
#   always-allow). We send "1" then Enter to select and submit it. We
#   deliberately avoid option 2 (always-allow) — that is a policy decision the
#   conductor must make explicitly, not a default of the mechanism.
set -uo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
PANE="${1:-}"; shift || true
FORCE=0
for a in "$@"; do [[ "$a" == "--force" ]] && FORCE=1; done
[[ -z "$PANE" ]] && { echo "usage: wt-approve.sh <pane-id> [--force]" >&2; exit 2; }

if [[ "$FORCE" != 1 ]]; then
  state="$(bash "$SELF_DIR/wt-state.sh" "$PANE")"
  if [[ "$state" != "permission" ]]; then
    echo "wt-approve: no permission prompt on '$PANE' (state=$state) — no-op." >&2
    echo "  (use --force to send anyway)" >&2
    exit 0
  fi
fi

# Select option 1 (plain Yes) and submit.
tmux send-keys -t "$PANE" -l -- "1"
sleep 0.15
tmux send-keys -t "$PANE" Enter
echo "wt-approve: selected '1. Yes' on $PANE"
