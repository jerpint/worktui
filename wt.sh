# Worktui shell wrapper
# Source this file in your ~/.zshrc:
#   source ~/worktui/wt.sh
#
# To uninstall, just remove that line.

wt() {
  local last_wt_file="/tmp/worktui-last-wt"

  # wt - : switch to last worktree
  if [ "$1" = "-" ]; then
    if [ -f "$last_wt_file" ]; then
      local prev=$(cat "$last_wt_file")
      if [ -d "$prev" ]; then
        echo "$PWD" > "$last_wt_file"
        cd "$prev"
      else
        echo "Last worktree no longer exists: $prev"
        return 1
      fi
    else
      echo "No previous worktree"
      return 1
    fi
    return
  fi

  # If CWD no longer exists (e.g. after deleting a worktree), cd home first
  if [ ! -d "$PWD" ]; then
    cd ~
  fi

  bun run ~/worktui/src/index.tsx "$@"

  local launch_file="/tmp/worktui-launch"
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
    echo "$PWD" > "$last_wt_file"
    cd "$cwd"
  elif [ "$kind" = "claude" ]; then
    local session_id=""
    if [[ "$payload" == *'"sessionId":"'* ]]; then
      session_id="${payload#*\"sessionId\":\"}"
      session_id="${session_id%%\"*}"
    fi

    local resume="false"
    if [[ "$payload" == *'"resume":true'* ]]; then
      resume="true"
    fi

    echo "$PWD" > "$last_wt_file"
    cd "$cwd"
    if [ -n "$session_id" ]; then
      claude --resume "$session_id"
    elif [ "$resume" = "true" ]; then
      claude --resume
    else
      claude
    fi
  fi
}
