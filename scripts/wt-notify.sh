#!/usr/bin/env bash
# wt-notify.sh — modular, data-driven notifier for conductor events.
# Usage: wt-notify.sh <text> [--branch <b>] [--kind <k>] [--event-json <json>]
#
# Fans a single notification out to every channel listed in
# WORKTUI_NOTIFY_CHANNELS (csv; default "eventlog"). Each channel is a shell
# function named notify_<channel>; adding a channel = define one function and
# add its name to the csv. Channels:
#   eventlog  — append the canonical normalized line to events.jsonl. This is
#               the seam `wt sessions watch` tails; always available.
#   desktop   — macOS Notification Center via osascript.
#   telegram  — Telegram Bot API sendMessage via curl (inert without creds).
#   slack     — Slack chat.postMessage via curl (inert without creds).
#
# Config (optional) is sourced from $WORKTUI_DIR/notify.env (mode 600,
# gitignored) — e.g. WORKTUI_NOTIFY_CHANNELS, WORKTUI_TG_TOKEN/_CHAT,
# WORKTUI_SLACK_TOKEN/_CHANNEL.
#
# Claude Code Remote Control covers the human phone-push natively (per the
# orchestrator plan); this notifier is the PROGRAMMATIC seam + extra channels
# for the conductor loop and out-of-band escalation.
#
# Never fatal: a failing channel is logged to stderr and skipped; exit 0.
set -uo pipefail

WORKTUI_DIR="${WORKTUI_DIR:-$HOME/.worktui}"
EVENTS_FILE="${WORKTUI_EVENTS_FILE:-$WORKTUI_DIR/events.jsonl}"

# Load optional config (channels + credentials). Never fail if absent.
# shellcheck source=/dev/null
[[ -f "$WORKTUI_DIR/notify.env" ]] && source "$WORKTUI_DIR/notify.env" 2>/dev/null || true

TEXT=""
BRANCH=""
KIND=""
EVENT_JSON=""        # if set, eventlog writes this verbatim (already-normalized line)
CHANNELS_OVERRIDE="" # --channels wins over notify.env / env / default
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)     BRANCH="${2:-}"; shift 2 ;;
    --kind)       KIND="${2:-}"; shift 2 ;;
    --event-json) EVENT_JSON="${2:-}"; shift 2 ;;
    --channels)   CHANNELS_OVERRIDE="${2:-}"; shift 2 ;;
    *)            TEXT="${TEXT:+$TEXT }$1"; shift ;;
  esac
done

# Precedence: explicit --channels > notify.env/env WORKTUI_NOTIFY_CHANNELS > default.
CHANNELS="${CHANNELS_OVERRIDE:-${WORKTUI_NOTIFY_CHANNELS:-eventlog}}"

# Minimal JSON string escaper (for building the eventlog line / API payloads).
json_str() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"; s="${s//$'\n'/\\n}"; s="${s//$'\r'/}"
  printf '"%s"' "$s"
}

# --- channels ---------------------------------------------------------------

notify_eventlog() {
  mkdir -p "$WORKTUI_DIR" 2>/dev/null || true
  if [[ -n "$EVENT_JSON" ]]; then
    printf '%s\n' "$EVENT_JSON" >> "$EVENTS_FILE"
  else
    # Build a normalized notify line when called standalone (e.g. `wt notify`).
    printf '{"source":"notify","branch":%s,"kind":%s,"text":%s}\n' \
      "$(json_str "$BRANCH")" "$(json_str "$KIND")" "$(json_str "$TEXT")" \
      >> "$EVENTS_FILE"
  fi
}

notify_desktop() {
  command -v osascript >/dev/null 2>&1 || { echo "wt-notify: osascript not found" >&2; return 0; }
  local title="worktui${BRANCH:+ · $BRANCH}"
  osascript -e "display notification \"${TEXT//\"/\\\"}\" with title \"${title//\"/\\\"}\"" \
    >/dev/null 2>&1 || true
}

notify_telegram() {
  [[ -n "${WORKTUI_TG_TOKEN:-}" && -n "${WORKTUI_TG_CHAT:-}" ]] || {
    echo "wt-notify: telegram inert (set WORKTUI_TG_TOKEN/_CHAT in notify.env)" >&2; return 0; }
  curl -fsS --max-time 5 \
    "https://api.telegram.org/bot${WORKTUI_TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${WORKTUI_TG_CHAT}" \
    --data-urlencode "text=${TEXT}" >/dev/null 2>&1 || true
}

notify_slack() {
  [[ -n "${WORKTUI_SLACK_TOKEN:-}" && -n "${WORKTUI_SLACK_CHANNEL:-}" ]] || {
    echo "wt-notify: slack inert (set WORKTUI_SLACK_TOKEN/_CHANNEL in notify.env)" >&2; return 0; }
  curl -fsS --max-time 5 -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer ${WORKTUI_SLACK_TOKEN}" \
    -H "Content-type: application/json; charset=utf-8" \
    --data "{\"channel\":$(json_str "$WORKTUI_SLACK_CHANNEL"),\"text\":$(json_str "$TEXT")}" \
    >/dev/null 2>&1 || true
}

# --- fan out ----------------------------------------------------------------

IFS=',' read -r -a chans <<< "$CHANNELS"
for c in "${chans[@]}"; do
  c="${c//[[:space:]]/}"   # trim spaces
  [[ -z "$c" ]] && continue
  if declare -F "notify_$c" >/dev/null; then
    "notify_$c" || echo "wt-notify: channel '$c' failed (ignored)" >&2
  else
    echo "wt-notify: unknown channel '$c' (skipped)" >&2
  fi
done

exit 0
