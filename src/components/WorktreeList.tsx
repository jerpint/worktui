import { Box, Text, useInput } from "ink";
import { useState, useEffect } from "react";
import type { Worktree, View } from "../types.js";
import { listWorktrees, getGitRoot } from "../git.js";
import { relativeTime, truncate } from "../utils.js";
import StatusBar from "./StatusBar.js";

type SortKey = "date" | "branch" | "status";

interface WorktreeListProps {
  onNavigate: (view: View) => void;
  onQuit: () => void;
}

export default function WorktreeList({ onNavigate, onQuit }: WorktreeListProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selected, setSelected] = useState(0);
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const root = await getGitRoot();
      const wts = await listWorktrees(root);
      setWorktrees(wts);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = [...worktrees].sort((a, b) => {
    if (sortBy === "date") return b.commitDate.getTime() - a.commitDate.getTime();
    if (sortBy === "branch") return a.branch.localeCompare(b.branch);
    // status: dirty first
    return (b.isDirty ? 1 : 0) - (a.isDirty ? 1 : 0);
  });

  const displayWorktrees = sorted;

  useInput((input, key) => {
    if (input === "q") {
      onQuit();
      return;
    }

    const count = displayWorktrees.length;
    if (count === 0) return;

    // Vim navigation
    if (input === "j" || key.downArrow) {
      setSelected((s) => (s < count - 1 ? s + 1 : 0));
    } else if (input === "k" || key.upArrow) {
      setSelected((s) => (s > 0 ? s - 1 : count - 1));
    }

    // Actions
    if (key.return) {
      const wt = displayWorktrees[selected];
      if (wt) onNavigate({ kind: "detail", worktree: wt });
    } else if (input === "c") {
      onNavigate({ kind: "create" });
    } else if (input === "d") {
      const wt = displayWorktrees[selected];
      if (wt && !wt.isMain) onNavigate({ kind: "delete", worktree: wt });
    } else if (input === "x") {
      onNavigate({ kind: "cleanup" });
    } else if (input === "s") {
      setSortBy((prev) => {
        const keys: SortKey[] = ["date", "branch", "status"];
        const idx = keys.indexOf(prev);
        return keys[(idx + 1) % keys.length];
      });
    } else if (input === "r") {
      load();
    }
  });

  if (loading && worktrees.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading worktrees...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Make sure you are in a git repository.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold color="cyan">
          Worktrees ({displayWorktrees.length})
        </Text>
        <Text dimColor>{"  sorted by: " + sortBy}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {displayWorktrees.length === 0 ? (
          <Text dimColor>No worktrees found. Press c to create one.</Text>
        ) : (
          displayWorktrees.map((wt, i) => {
            const isSelected = i === selected;
            const prefix = isSelected ? ">" : " ";
            const branchDisplay = truncate(wt.branch || "(detached)", 38);
            const time = relativeTime(wt.commitDate);
            const status = wt.isDirty ? "DIRTY" : "clean";
            const statusColor = wt.isDirty ? "red" : "green";
            const sessions =
              wt.sessionCount > 0
                ? `${wt.sessionCount} session${wt.sessionCount > 1 ? "s" : ""}`
                : "\u2014";
            const mainTag = wt.isMain ? " [main]" : "";

            return (
              <Box key={wt.path}>
                <Text color={isSelected ? "green" : undefined} bold={isSelected}>
                  {prefix}{" "}
                </Text>
                <Text color={isSelected ? "green" : "white"}>
                  {branchDisplay.padEnd(40)}
                </Text>
                <Text dimColor>{time.padEnd(10)}</Text>
                <Text color={statusColor}>{status.padEnd(8)}</Text>
                <Text dimColor>{wt.head}  </Text>
                <Text dimColor>{sessions}</Text>
                <Text color="yellow">{mainTag}</Text>
              </Box>
            );
          })
        )}
      </Box>

      <StatusBar
        hints={[
          { key: "j/k", label: "navigate" },
          { key: "\u23CE", label: "open" },
          { key: "c", label: "create" },
          { key: "d", label: "delete" },
          { key: "x", label: "cleanup" },
          { key: "s", label: "sort" },
          { key: "r", label: "refresh" },
          { key: "q", label: "quit" },
        ]}
      />
    </Box>
  );
}
