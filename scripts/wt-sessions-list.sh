#!/usr/bin/env bash
# wt-sessions-list.sh — list LIVE Claude panes across all tmux sessions.
# Usage: wt-sessions-list.sh [--json]
#
# Replaces raw `tmux list-panes` for the conductor. One row per live Claude
# session pane. Discovery:
#   - a pane is a Claude session if its current command is `claude` OR it
#     carries the @wt_branch tag we set at spawn (Phase 2). The tag also makes
#     manually-launched sessions discoverable and survives pane-id reuse.
#   - the sibling SHELL pane = the other pane in the same window (preferring
#     one tagged @wt_role=shell).
#
# Columns: branch · worktree-path · window · claude-pane · shell-pane · state
#          · working-on
#   - branch:    @wt_branch tag → window name → basename of the worktree path.
#   - state:     from wt-state.sh (running|idle|permission|done|error).
#   - working-on: the pane title with its leading status glyph stripped.
#
# IMPLEMENTATION NOTE on the field delimiter: we want a NON-whitespace delim so
# `read` doesn't collapse consecutive empty fields (empty @wt_branch/@wt_role
# would otherwise misalign columns). But tmux ESCAPES control bytes in `-F`
# output (a literal \037 byte becomes the 4-char text "\037"), so we can't ask
# tmux to emit one directly. tmux DOES pass tab through unescaped — so we use
# tab as tmux's delimiter, then `tr` it to the ASCII Unit Separator (\037),
# which `read` splits on without whitespace-collapse. (No field but the
# free-form title could contain a tab, and title is read last as the remainder.)
set -uo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTUI_DIR="${WORKTUI_DIR:-$HOME/.worktui}"
JSON=0
[[ "${1:-}" == "--json" ]] && JSON=1

TAB=$(printf '\t')
US=$(printf '\037')   # parse delimiter (non-whitespace; preserves empty fields)

# Gather every pane once. tmux emits tab-separated; we convert tabs → US.
# Fields: pane_id cmd path window_index window_name window_id @wt_branch @wt_role title
panes="$(tmux list-panes -a -F \
  "#{pane_id}${TAB}#{pane_current_command}${TAB}#{pane_current_path}${TAB}#{window_index}${TAB}#{window_name}${TAB}#{window_id}${TAB}#{@wt_branch}${TAB}#{@wt_role}${TAB}#{pane_title}" \
  2>/dev/null | tr '\t' '\037' || true)"

# Find the sibling shell pane for a window_id, excluding the claude pane.
# Prefer a pane tagged @wt_role=shell; else the first other pane in the window.
sibling_shell() {
  local win="$1" claude_pane="$2" fallback=""
  while IFS="$US" read -r pid cmd path widx wname wid branch role title; do
    [[ "$wid" == "$win" && "$pid" != "$claude_pane" ]] || continue
    if [[ "$role" == "shell" ]]; then echo "$pid"; return; fi
    [[ -z "$fallback" ]] && fallback="$pid"
  done <<< "$panes"
  echo "$fallback"
}

# Strip a leading status glyph + space from the pane title ("✳ task" → "task").
# Claude titles are "<glyph> <task>"; the glyph is a non-alphanumeric token. We
# avoid sed (multibyte-glyph matching is locale-fragile) and just drop the first
# space-delimited token when the title doesn't already start with alphanumerics.
strip_glyph() {
  case "$1" in
    [A-Za-z0-9]*) printf '%s' "$1" ;;   # no leading glyph — keep as-is
    *)            printf '%s' "${1#* }" ;;  # drop leading "<glyph> "
  esac
}

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"; s="${s//$'\n'/\\n}"; s="${s//$'\r'/}"
  printf '%s' "$s"
}

rows=()   # US-joined: branch path window claude shell state workingon
while IFS="$US" read -r pid cmd path widx wname wid branch role title; do
  [[ -z "$pid" ]] && continue
  # claude session? command is claude OR carries @wt_branch tag.
  is_claude=0
  [[ "$cmd" == "claude" ]] && is_claude=1
  [[ -n "$branch" ]] && is_claude=1
  [[ "$is_claude" == 1 ]] || continue
  # never list the shell side of a tagged pair.
  [[ "$role" == "shell" ]] && continue

  b="$branch"
  [[ -z "$b" ]] && b="$wname"
  [[ -z "$b" ]] && b="$(basename "$path")"

  shell_pane="$(sibling_shell "$wid" "$pid")"
  state="$(bash "$SELF_DIR/wt-state.sh" "$pid")"
  workingon="$(strip_glyph "$title")"

  rows+=("${b}${US}${path}${US}${widx}${US}${pid}${US}${shell_pane}${US}${state}${US}${workingon}")
done <<< "$panes"

if [[ "$JSON" == 1 ]]; then
  printf '['
  first=1
  for r in "${rows[@]}"; do
    IFS="$US" read -r b path widx claude shell state workingon <<< "$r"
    [[ "$first" == 1 ]] && first=0 || printf ','
    printf '{"branch":"%s","path":"%s","window":"%s","claudePane":"%s","shellPane":"%s","state":"%s","workingOn":"%s"}' \
      "$(json_escape "$b")" "$(json_escape "$path")" "$(json_escape "$widx")" \
      "$(json_escape "$claude")" "$(json_escape "$shell")" "$(json_escape "$state")" \
      "$(json_escape "$workingon")"
  done
  printf ']\n'
  exit 0
fi

if [[ ${#rows[@]} -eq 0 ]]; then
  echo "No live Claude sessions."
  exit 0
fi

printf '%-24s %-6s %-7s %-7s %-11s %s\n' "BRANCH" "WIN" "CLAUDE" "SHELL" "STATE" "WORKING-ON"
for r in "${rows[@]}"; do
  IFS="$US" read -r b path widx claude shell state workingon <<< "$r"
  wo="$workingon"; [[ ${#wo} -gt 44 ]] && wo="${wo:0:43}…"
  printf '%-24s %-6s %-7s %-7s %-11s %s\n' \
    "${b:0:24}" "$widx" "$claude" "${shell:--}" "$state" "$wo"
done
