# Claudioscope shell wrapper
# Source this file in your ~/.zshrc:
#   source ~/claudioscope/wt.sh
#
# To uninstall, just remove that line.

wt() {
  bun run ~/claudioscope/src/index.tsx "$@"

  local launch_file="/tmp/claudioscope-launch"
  if [ ! -f "$launch_file" ]; then
    return
  fi

  local payload=$(cat "$launch_file")
  rm -f "$launch_file"
  echo "[wt] payload: $payload" >&2

  # Parse kind and cwd from JSON using parameter expansion
  local kind="${payload#*\"kind\":\"}"
  kind="${kind%%\"*}"

  local cwd="${payload#*\"cwd\":\"}"
  cwd="${cwd%%\"*}"

  echo "[wt] kind=$kind cwd=$cwd" >&2

  if [ "$kind" = "shell" ]; then
    cd "$cwd"
  elif [ "$kind" = "claude" ]; then
    local session_id=""
    if [[ "$payload" == *'"sessionId":"'* ]]; then
      session_id="${payload#*\"sessionId\":\"}"
      session_id="${session_id%%\"*}"
    fi

    echo "[wt] session_id=$session_id" >&2

    cd "$cwd"
    if [ -n "$session_id" ]; then
      claude --resume "$session_id"
    else
      claude
    fi
  fi
}
