#!/usr/bin/env bash
# wt-notify-hook.sh — Claude Code `Notification` hook target.
#
# Registered into a spawned worktree's .claude/settings.local.json by
# wt-spawn.sh. Claude Code invokes it with the Notification event JSON on
# stdin. We normalize that into one line appended to the event sink that
# `wt sessions watch` tails, then fire the modular notifier for any
# human-facing channels.
#
# Hook schema (verified against Claude Code v2.1.170 docs):
#   - Notification fires on permission_prompt (tool approval needed),
#     idle_prompt (done/awaiting input), auth_success, and MCP elicitation_*.
#   - stdin JSON carries: session_id, transcript_path, cwd, permission_mode,
#     hook_event_name, notification_type (the matcher value).
#   - Notification hooks are NON-BLOCKING: exit code never affects the child.
#
# CONTRACT: must never block or break the child session — fast, no long
# in-path network, ALWAYS exit 0. We nest the raw stdin JSON verbatim as
# `payload` (no JSON parser needed). Branch comes from $WT_HOOK_BRANCH (set as
# a shell-prefix env in the hook command — Claude Code does NOT interpolate
# $VARs into command hooks, but a literal `WT_HOOK_BRANCH=... /abs/hook.sh`
# prefix is plain sh and works), falling back to the basename of cwd.

SELF_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || SELF_DIR=""
WORKTUI_DIR="${WORKTUI_DIR:-$HOME/.worktui}"
EVENTS_FILE="${WORKTUI_EVENTS_FILE:-$WORKTUI_DIR/events.jsonl}"

# Read the raw hook JSON from stdin (may be empty if invoked oddly).
RAW="$(cat 2>/dev/null)"
[[ -z "$RAW" ]] && RAW="{}"

BRANCH="${WT_HOOK_BRANCH:-$(basename "$PWD" 2>/dev/null)}"
CWD="$PWD"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)"

# JSON string escaper for the scalar fields (payload is nested raw).
json_str() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"; s="${s//$'\n'/\\n}"; s="${s//$'\r'/}"
  printf '"%s"' "$s"
}

# Normalized event line: raw stdin nested verbatim as `payload`.
EVENT_JSON="$(printf '{"ts":%s,"source":"hook","branch":%s,"cwd":%s,"payload":%s}' \
  "$(json_str "$TS")" "$(json_str "$BRANCH")" "$(json_str "$CWD")" "$RAW")"

# 1. Canonical seam: append synchronously (instant, local, guaranteed even if
#    the notifier is unavailable).
mkdir -p "$WORKTUI_DIR" 2>/dev/null
printf '%s\n' "$EVENT_JSON" >> "$EVENTS_FILE" 2>/dev/null

# 2. Dispatch human-facing channels via the notifier, EXCLUDING eventlog (we
#    already appended above). Backgrounded + detached so no channel — including
#    a slow network curl — can ever stall the child session.
NOTIFY="$SELF_DIR/wt-notify.sh"
if [[ -x "$NOTIFY" ]]; then
  # shellcheck source=/dev/null
  [[ -f "$WORKTUI_DIR/notify.env" ]] && source "$WORKTUI_DIR/notify.env" 2>/dev/null
  CHANNELS="${WORKTUI_NOTIFY_CHANNELS:-eventlog}"
  # strip eventlog (case-insensitive, whitespace-tolerant) from the csv
  EXTRA="$(printf '%s' "$CHANNELS" | tr ',' '\n' \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
    | grep -viE '^eventlog$' | paste -sd, - 2>/dev/null)"
  if [[ -n "$EXTRA" ]]; then
    # Human-readable summary: pull notification_type/message best-effort (no
    # strict parser — these only feed the desktop/chat text, not the sink).
    NTYPE="$(printf '%s' "$RAW" | grep -oE '"notification_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)"$/\1/')"
    MSG="$(printf '%s' "$RAW" | grep -oE '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"$/\1/')"
    TEXT="[$BRANCH] ${NTYPE:-notification}${MSG:+: $MSG}"
    nohup "$NOTIFY" --channels "$EXTRA" --branch "$BRANCH" --kind "${NTYPE:-notification}" \
      --event-json "$EVENT_JSON" "$TEXT" >/dev/null 2>&1 &
  fi
fi

exit 0
