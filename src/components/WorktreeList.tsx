import { Box, Text, useInput } from "ink";
import { useState, useEffect, useMemo } from "react";
import type { Worktree, View, LaunchTarget } from "../types.js";
import { listWorktrees, getGitRoot } from "../git.js";
import { relativeTime, truncate, fuzzyMatch } from "../utils.js";
import StatusBar from "./StatusBar.js";

type SortKey = "date" | "branch" | "status";
type Mode = "insert" | "normal";

interface WorktreeListProps {
  onNavigate: (view: View) => void;
  onLaunch: (target: LaunchTarget) => void;
  onQuit: () => void;
}

export default function WorktreeList({ onNavigate, onLaunch, onQuit }: WorktreeListProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selected, setSelected] = useState(0);
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("normal");
  const [filter, setFilter] = useState("");

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

  const sorted = useMemo(() => {
    return [...worktrees].sort((a, b) => {
      if (sortBy === "date") return b.commitDate.getTime() - a.commitDate.getTime();
      if (sortBy === "branch") return a.branch.localeCompare(b.branch);
      return (b.isDirty ? 1 : 0) - (a.isDirty ? 1 : 0);
    });
  }, [worktrees, sortBy]);

  const displayWorktrees = useMemo(() => {
    if (!filter) return sorted;
    return sorted
      .map((wt) => ({ wt, score: fuzzyMatch(filter, wt.branch) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.wt);
  }, [sorted, filter]);

  // Clamp selection when filtered list shrinks
  useEffect(() => {
    if (selected >= displayWorktrees.length && displayWorktrees.length > 0) {
      setSelected(displayWorktrees.length - 1);
    }
  }, [displayWorktrees.length]);

  const navigate = (dir: "up" | "down") => {
    const count = displayWorktrees.length;
    if (count === 0) return;
    if (dir === "down") {
      setSelected((s) => (s < count - 1 ? s + 1 : 0));
    } else {
      setSelected((s) => (s > 0 ? s - 1 : count - 1));
    }
  };

  useInput((input, key) => {
    // Arrow keys always navigate, regardless of mode
    if (key.downArrow) { navigate("down"); return; }
    if (key.upArrow) { navigate("up"); return; }

    // Enter always opens shell in worktree
    if (key.return) {
      const wt = displayWorktrees[selected];
      if (wt) onLaunch({ kind: "shell", cwd: wt.path });
      return;
    }

    // l/o opens detail view in normal mode
    if (mode === "normal" && (input === "l" || input === "o")) {
      const wt = displayWorktrees[selected];
      if (wt) onNavigate({ kind: "detail", worktree: wt });
      return;
    }

    if (mode === "insert") {
      if (key.escape) {
        setMode("normal");
        return;
      }
      if (key.backspace || key.delete) {
        setFilter((f) => f.slice(0, -1));
        setSelected(0);
        return;
      }
      // Printable characters go into the filter
      if (input && !key.ctrl && !key.meta) {
        setFilter((f) => f + input);
        setSelected(0);
      }
      return;
    }

    // Normal mode
    if (input === "q") {
      onQuit();
      return;
    }
    if (input === "/" || input === "i") {
      setMode("insert");
      return;
    }

    // Vim nav
    if (input === "j") { navigate("down"); return; }
    if (input === "k") { navigate("up"); return; }

    // Actions
    if (input === "c") {
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
    } else if (input === "f") {
      onNavigate({ kind: "fetch" });
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

  const modeLabel = mode === "insert" ? "INSERT" : "NORMAL";
  const modeColor = mode === "insert" ? "yellow" : "blue";

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold color="cyan">
          Worktrees ({displayWorktrees.length}{filter ? `/${worktrees.length}` : ""})
        </Text>
        <Text dimColor>{"  sorted by: " + sortBy + "  "}</Text>
        <Text color={modeColor} bold>-- {modeLabel} --</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={mode === "insert" ? "yellow" : "gray"}>{"> "}</Text>
        <Text>{filter}</Text>
        {mode === "insert" && <Text color="yellow">|</Text>}
      </Box>

      <Box flexDirection="column">
        {displayWorktrees.length === 0 ? (
          <Text dimColor>
            {filter ? "No matches." : "No worktrees found. Press c to create one."}
          </Text>
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
        hints={
          mode === "insert"
            ? [
                { key: "\u2191\u2193", label: "navigate" },
                { key: "\u23CE", label: "open" },
                { key: "esc", label: "normal mode" },
              ]
            : [
                { key: "/", label: "filter" },
                { key: "j/k", label: "navigate" },
                { key: "\u23CE", label: "shell" },
                { key: "o", label: "sessions" },
                { key: "c", label: "create" },
                { key: "f", label: "fetch" },
                { key: "d", label: "delete" },
                { key: "x", label: "cleanup" },
                { key: "s", label: "sort" },
                { key: "r", label: "refresh" },
                { key: "q", label: "quit" },
              ]
        }
      />
    </Box>
  );
}
