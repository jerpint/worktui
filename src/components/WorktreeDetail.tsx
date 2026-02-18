import { Box, Text, useInput } from "ink";
import { useState, useEffect } from "react";
import type { Worktree, ClaudeSession, LaunchTarget } from "../types.js";
import { getSessions } from "../sessions.js";
import { relativeTime, truncate } from "../utils.js";
import StatusBar from "./StatusBar.js";

interface WorktreeDetailProps {
  worktree: Worktree;
  onBack: () => void;
  onQuit: () => void;
  onLaunch: (target: LaunchTarget) => void;
}

export default function WorktreeDetail({
  worktree,
  onBack,
  onQuit,
  onLaunch,
}: WorktreeDetailProps) {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions(worktree.path).then((s) => {
      setSessions(s);
      setLoading(false);
    });
  }, [worktree.path]);

  useInput((input, key) => {
    if (key.escape || input === "h") {
      onBack();
      return;
    }
    if (input === "q") {
      onQuit();
      return;
    }

    // Sessions at indices 0..n-1, "New session" at index n
    const count = sessions.length + 1;
    const newSessionIdx = sessions.length;

    // Vim navigation
    if (input === "j" || key.downArrow) {
      setSelected((s) => (s < count - 1 ? s + 1 : 0));
    } else if (input === "k" || key.upArrow) {
      setSelected((s) => (s > 0 ? s - 1 : count - 1));
    }

    if (key.return) {
      if (selected === newSessionIdx) {
        onLaunch({ kind: "claude", cwd: worktree.path });
      } else {
        const session = sessions[selected];
        if (session) {
          onLaunch({ kind: "claude", sessionId: session.sessionId, cwd: worktree.path });
        }
      }
    } else if (input === "n") {
      onLaunch({ kind: "claude", cwd: worktree.path });
    } else if (input === "r" && sessions.length > 0) {
      onLaunch({ kind: "claude", sessionId: sessions[0].sessionId, cwd: worktree.path });
    } else if (input === "o") {
      onLaunch({ kind: "shell", cwd: worktree.path });
    }
  });

  const status = worktree.isDirty ? "DIRTY" : "clean";
  const statusColor = worktree.isDirty ? "red" : "green";

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold color="cyan">
          {truncate(worktree.branch, 50)}
        </Text>
        <Text dimColor> ({relativeTime(worktree.commitDate)}, </Text>
        <Text color={statusColor}>{status}</Text>
        <Text dimColor>)</Text>
      </Box>

      {loading ? (
        <Box marginTop={1}>
          <Text>Loading sessions...</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {sessions.length > 0 && (
            <>
              <Box>
                <Text dimColor>Sessions ({sessions.length}):</Text>
              </Box>
              <Box flexDirection="column">
                <Box>
                  <Text dimColor>{"   Date            Summary                                    Msgs"}</Text>
                </Box>
                {sessions.map((s, i) => {
                  const isSelected = i === selected;
                  const prefix = isSelected ? " >" : "  ";
                  const dateStr = s.modified.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  const timeStr = s.modified.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  });
                  const summary = truncate(s.summary || s.firstPrompt || "(no prompt)", 43);
                  const msgs = String(s.messageCount).padStart(4);

                  return (
                    <Box key={s.sessionId}>
                      <Text color={isSelected ? "green" : undefined} bold={isSelected}>
                        {prefix}{" "}
                      </Text>
                      <Text color={isSelected ? "green" : "white"}>
                        {`${dateStr} ${timeStr}`.padEnd(16)}
                      </Text>
                      <Text color={isSelected ? "green" : undefined}>
                        {summary.padEnd(45)}
                      </Text>
                      <Text dimColor>{msgs}</Text>
                    </Box>
                  );
                })}
              </Box>
            </>
          )}

          <Box marginTop={sessions.length > 0 ? 1 : 0}>
            <Text color={selected === sessions.length ? "green" : "cyan"} bold>
              {selected === sessions.length ? " > " : "   "}
              + New session
            </Text>
          </Box>
        </Box>
      )}

      <StatusBar
        hints={[
          { key: "j/k", label: "navigate" },
          { key: "\u23CE", label: "select" },
          { key: "n", label: "new session" },
          { key: "r", label: "resume last" },
          { key: "o", label: "open shell" },
          { key: "esc/h", label: "back" },
          { key: "q", label: "quit" },
        ]}
      />
    </Box>
  );
}
