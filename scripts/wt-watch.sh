#!/usr/bin/env bash
# wt-watch.sh — stream conductor events from the sink as they arrive.
# Usage: wt-watch.sh [--json]
#
# Tails the append-only event sink ($WORKTUI_DIR/events.jsonl) that
# wt-notify-hook.sh writes to. This is the single feed the conductor consumes:
#
#   wt sessions watch --json | while read -r ev; do orchestrator-react "$ev"; done
#
# --json : pass each normalized event line through verbatim (already JSON).
# default: a compact human line per event (ts · branch · source · type).
#
# Follows NEW events only (does not replay backlog), so a freshly started watch
# reacts to live transitions without re-processing history. `tail -F` survives
# the sink being created/rotated. v1 is sink-tail only; merging tmux state
# transitions (for panes without hook coverage) can layer on later.
set -uo pipefail

WORKTUI_DIR="${WORKTUI_DIR:-$HOME/.worktui}"
EVENTS_FILE="${WORKTUI_EVENTS_FILE:-$WORKTUI_DIR/events.jsonl}"
JSON=0
[[ "${1:-}" == "--json" ]] && JSON=1

mkdir -p "$WORKTUI_DIR" 2>/dev/null || true
touch "$EVENTS_FILE" 2>/dev/null || true

if [[ "$JSON" == 1 ]]; then
  # Raw normalized JSON, one event per line — the machine feed.
  exec tail -n 0 -F "$EVENTS_FILE"
fi

# Human feed: extract a few scalars best-effort (no jq dependency).
field() { printf '%s' "$1" | grep -oE "\"$2\":\"[^\"]*\"" | head -1 | sed -E 's/.*:"([^"]*)"$/\1/'; }

tail -n 0 -F "$EVENTS_FILE" | while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  ts="$(field "$line" ts)"
  branch="$(field "$line" branch)"
  src="$(field "$line" source)"
  ntype="$(field "$line" notification_type)"   # from nested payload, if present
  kind="$(field "$line" kind)"
  label="${ntype:-${kind:-event}}"
  printf '%s  %-22s %-8s %s\n' "${ts:-?}" "${branch:-?}" "${src:-?}" "$label"
done
