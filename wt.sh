# Claudioscope shell wrapper
# Source this file in your ~/.zshrc:
#   source ~/claudioscope/wt.sh
#
# To uninstall, just remove that line.

wt() {
  # If CWD no longer exists (e.g. after deleting a worktree), cd home first
  if [ ! -d "$PWD" ]; then
    cd ~
  fi

  bun run ~/claudioscope/src/index.tsx "$@"

  local launch_file="/tmp/claudioscope-launch"
  if [ ! -f "$launch_file" ]; then
    return
  fi

  local payload=$(cat "$launch_file")
  rm -f "$launch_file"

  local kind="${payload#*\"kind\":\"}"
  kind="${kind%%\"*}"

  local cwd="${payload#*\"cwd\":\"}"
  cwd="${cwd%%\"*}"

  if [ "$kind" = "shell" ]; then
    cd "$cwd"
  elif [ "$kind" = "claude" ]; then
    local session_id=""
    if [[ "$payload" == *'"sessionId":"'* ]]; then
      session_id="${payload#*\"sessionId\":\"}"
      session_id="${session_id%%\"*}"
    fi

    cd "$cwd"
    if [ -n "$session_id" ]; then
      claude --resume "$session_id"
    else
      claude
    fi
  fi
}
