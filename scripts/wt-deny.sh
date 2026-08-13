#!/usr/bin/env bash
# wt-deny.sh — dismiss a Claude permission dialog (decline the action).
# Usage: wt-deny.sh <pane-id> [--force]
#
# Safety: like wt-approve.sh, confirms a permission prompt is present first
# (unless --force) and otherwise no-ops with a message.
#
# KEY-MAPPING ASSUMPTIONS (Claude Code v2.1.170, locked against live frames):
#   The permission box footer reads "Esc to cancel · Tab to amend · …", and
#   the menu's last option is "3. No". Escape is the most robust "decline":
#   it cancels the prompt outright regardless of how many options the box has
#   (some prompts have 2 options, some 3), and it matches the documented
#   cancel affordance. We therefore deny via Escape rather than selecting a
#   numbered "No", whose position varies.
set -uo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
PANE="${1:-}"; shift || true
FORCE=0
for a in "$@"; do [[ "$a" == "--force" ]] && FORCE=1; done
[[ -z "$PANE" ]] && { echo "usage: wt-deny.sh <pane-id> [--force]" >&2; exit 2; }

if [[ "$FORCE" != 1 ]]; then
  state="$(bash "$SELF_DIR/wt-state.sh" "$PANE")"
  if [[ "$state" != "permission" ]]; then
    echo "wt-deny: no permission prompt on '$PANE' (state=$state) — no-op." >&2
    echo "  (use --force to send anyway)" >&2
    exit 0
  fi
fi

# Escape cancels the dialog (declines the pending action).
tmux send-keys -t "$PANE" Escape
echo "wt-deny: sent Escape (cancel) to $PANE"
