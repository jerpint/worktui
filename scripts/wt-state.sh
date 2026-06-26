#!/usr/bin/env bash
# wt-state.sh — classify a Claude pane's state. Prints exactly one of:
#   running | idle | permission | done | error
#
# Usage: wt-state.sh <pane-id> [--debug]
#
# This is the load-bearing detector for the conductor (the plan flags
# permission-vs-idle-vs-done as the riskiest assumption). Regexes below were
# locked against REAL frames captured from Claude Code v2.1.170 — see the
# "CORPUS" notes inline. Signals are evaluated cheapest-first:
#
#   1. pane existence      — a vanished pane id means the process exited and
#                            tmux destroyed the pane ⇒ `done` (sessions/shell
#                            gone). tmux destroys panes on exit unless
#                            remain-on-exit was set, so "gone" is the common
#                            clean-exit signal.
#   2. pane_dead + status  — if remain-on-exit kept a dead pane: status 0 ⇒
#                            `done`, non-zero ⇒ `error`.
#   3. title glyph         — Claude sets the pane title to "<glyph> <task>".
#                            A braille spinner glyph (U+2800..U+28FF, e.g. ⠐⠂⠄)
#                            ⇒ `running`. The idle/await glyph is ✳ (U+2733),
#                            which it ALSO shows while a permission prompt is
#                            up — so the glyph alone canNOT separate
#                            permission from idle. Hence step 4.
#   4. capture-pane regex  — disambiguate the silent states from pane content:
#                            permission box → `permission`; error banner →
#                            `error`; otherwise → `idle`.
#
# Note: hooks (Phase 2) are the AUTHORITATIVE source for done/idle/permission
# in-session; this tmux classifier is the FALLBACK for panes without hook
# coverage (and the shell pane). `done` from pane content alone is inherently
# approximate — we lean on (1)/(2) for it and otherwise default to `idle`.
set -uo pipefail

PANE="${1:-}"
DEBUG=0
[[ "${2:-}" == "--debug" ]] && DEBUG=1
[[ -z "$PANE" ]] && { echo "usage: wt-state.sh <pane-id> [--debug]" >&2; exit 2; }

dbg() { [[ "$DEBUG" == 1 ]] && echo "wt-state: $*" >&2; return 0; }

# 1. Does the pane still exist? Query meta in a single tmux call. tmux returns
#    a 0 exit and EMPTY field expansions for a bad target (it does not fail),
#    so we lead the format with #{pane_id} and treat an empty id as "gone".
meta="$(tmux display-message -p -t "$PANE" \
  -F '#{pane_id}|#{pane_dead}|#{pane_dead_status}|#{pane_current_command}|#{pane_title}' 2>/dev/null)" || true

ID="${meta%%|*}";            rest="${meta#*|}"
if [[ -z "$ID" ]]; then
  dbg "pane '$PANE' not found (empty id) → done (process exited, pane destroyed)"
  echo done
  exit 0
fi
DEAD="${rest%%|*}";          rest="${rest#*|}"
STATUS="${rest%%|*}";        rest="${rest#*|}"
CMD="${rest%%|*}"
TITLE="${rest#*|}"
dbg "id=$ID dead=$DEAD status=$STATUS cmd=$CMD title=[$TITLE]"

# 2. Dead pane (remain-on-exit): exit status decides done vs error.
if [[ "$DEAD" == "1" ]]; then
  if [[ "${STATUS:-0}" == "0" ]]; then echo done; else echo error; fi
  exit 0
fi

# 3. Title glyph: braille spinner block U+2800..U+28FF ⇒ running.
#    UTF-8 for that block is E2 A0 80 .. E2 A3 BF, so the leading two bytes of
#    the first glyph are e2a0/e2a1/e2a2/e2a3. Byte-prefix test is portable
#    (no grep -P, which BSD/macOS grep lacks).
trimmed="${TITLE#"${TITLE%%[![:space:]]*}"}"   # lstrip
first2="$(printf '%s' "$trimmed" | head -c2 | od -An -tx1 2>/dev/null | tr -d ' \n')"
case "$first2" in
  e2a0|e2a1|e2a2|e2a3) dbg "braille glyph → running"; echo running; exit 0 ;;
esac

# 4. Disambiguate silent states from pane content.
buf="$(tmux capture-pane -t "$PANE" -p -J -S -120 2>/dev/null || true)"

# CORPUS (permission) — captured live:
#   "Do you want to proceed?"
#   "❯ 1. Yes" / "2. Yes, and always allow…" / "3. No"
#   "Esc to cancel · Tab to amend · ctrl+e to explain"
# Match the question line (covers "proceed?", "make this edit?", "create?",
# "trust the files…?") corroborated by the cancel hint or the numbered box.
if printf '%s' "$buf" | grep -qE 'Do you want to (proceed|make|create|trust|run|allow|delete|continue)'; then
  dbg "permission question matched"
  echo permission; exit 0
fi
if printf '%s' "$buf" | grep -qE '(Esc to cancel|Tab to amend|ctrl\+e to explain)' \
   && printf '%s' "$buf" | grep -qE '^[[:space:]]*❯?[[:space:]]*[0-9]+\.[[:space:]]+(Yes|No)'; then
  dbg "permission box matched"
  echo permission; exit 0
fi

# error — conservative banners (provisional; reproducing a live API error is
# hard, so these are pattern-based, not corpus-locked — widen as we see real
# frames). Kept narrow to avoid false positives on normal output.
if printf '%s' "$buf" | grep -qE '(API Error|⎿[[:space:]]*Error:|Request timed out|Overloaded|Execution error|esc to interrupt.*failed)'; then
  dbg "error banner matched"
  echo error; exit 0
fi

# Default: not spinning, no prompt box, no error ⇒ idle (awaiting input).
dbg "default → idle"
echo idle
