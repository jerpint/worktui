import { Box, Text, useInput } from "ink";
import { useState, useEffect, useMemo } from "react";
import type { LaunchTarget } from "../types.js";
import { getGitRoot, fetchRemote, listRemoteBranches, listWorktrees, createWorktree } from "../git.js";
import type { RemoteBranch } from "../git.js";
import { fuzzyMatch, truncate, relativeTime } from "../utils.js";
import StatusBar from "./StatusBar.js";
import SearchBar from "./SearchBar.js";
import { theme } from "../theme.js";

type Mode = "insert" | "normal";

interface FetchBranchProps {
  onBack: () => void;
  onQuit: () => void;
  onLaunch: (target: LaunchTarget) => void;
}

export default function FetchBranch({ onBack, onQuit, onLaunch }: FetchBranchProps) {
  const [branches, setBranches] = useState<RemoteBranch[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("insert");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const root = await getGitRoot();
        await fetchRemote(root);
        const wts = await listWorktrees(root);
        const localBranches = new Set(wts.map((wt) => wt.branch));
        const remote = await listRemoteBranches(root, localBranches);
        setBranches(remote);
      } catch (err: any) {
        setError(err.message);
      }
      setLoading(false);
    })();
  }, []);

  const displayBranches = useMemo(() => {
    if (!filter) return branches;
    return branches
      .map((b) => ({ b, score: fuzzyMatch(filter, b.name) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.b);
  }, [branches, filter]);

  useEffect(() => {
    if (selected >= displayBranches.length && displayBranches.length > 0) {
      setSelected(displayBranches.length - 1);
    }
  }, [displayBranches.length]);

  const navigate = (dir: "up" | "down") => {
    const count = displayBranches.length;
    if (count === 0) return;
    if (dir === "down") {
      setSelected((s) => (s < count - 1 ? s + 1 : 0));
    } else {
      setSelected((s) => (s > 0 ? s - 1 : count - 1));
    }
  };

  const checkoutBranch = async (branch: string) => {
    setCreating(branch);
    try {
      const root = await getGitRoot();
      const worktreePath = await createWorktree(root, branch);
      onLaunch({ kind: "shell", cwd: worktreePath });
    } catch (err: any) {
      setError(err.message);
      setCreating(null);
    }
  };

  useInput((input, key) => {
    if (creating) return;

    if (key.downArrow) { navigate("down"); return; }
    if (key.upArrow) { navigate("up"); return; }

    if (key.return) {
      const branch = displayBranches[selected];
      if (branch) checkoutBranch(branch.name);
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
      if (input && !key.ctrl && !key.meta) {
        setFilter((f) => f + input);
        setSelected(0);
      }
      return;
    }

    // Normal mode
    if (key.escape || input === "h" || key.leftArrow) { onBack(); return; }
    if (input === "q") { onQuit(); return; }
    if (input === "/" || input === "i") { setMode("insert"); return; }
    if (input === "j") { navigate("down"); return; }
    if (input === "k") { navigate("up"); return; }
    if (input === "l" || key.rightArrow) {
      const branch = displayBranches[selected];
      if (branch) checkoutBranch(branch.name);
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Fetching remote branches...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.error}>Error: {error}</Text>
        <Text color={theme.dim}>Press esc to go back.</Text>
      </Box>
    );
  }

  if (creating) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Creating worktree for <Text color={theme.selected} bold>{creating}</Text>...</Text>
      </Box>
    );
  }

  const modeLabel = mode === "insert" ? "INSERT" : "NORMAL";
  const modeColor = mode === "insert" ? theme.modeInsert : theme.modeNormal;

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold color={theme.accent}>
          Remote Branches ({displayBranches.length}{filter ? `/${branches.length}` : ""})
        </Text>
        <Text>{"  "}</Text>
        <Text color={modeColor} bold>-- {modeLabel} --</Text>
      </Box>

      <Box marginTop={1}>
        <SearchBar
          value={filter}
          focused={mode === "insert"}

        />
      </Box>

      <Box flexDirection="column">
        {displayBranches.length === 0 ? (
          <Text color={theme.dim}>
            {filter ? "No matches." : "No remote branches without local worktrees."}
          </Text>
        ) : (
          displayBranches.slice(0, 20).map((branch, i) => {
            const isSelected = i === selected;
            const prefix = isSelected ? " ● " : "   ";
            const time = relativeTime(branch.date);
            return (
              <Box key={branch.name}>
                <Text color={isSelected ? theme.selected : undefined}>
                  {prefix}
                </Text>
                <Text color={isSelected ? theme.selectedText : theme.text} bold={isSelected}>
                  {truncate(branch.name, 45).padEnd(47)}
                </Text>
                <Text color={theme.dim}>{time.padEnd(10)}</Text>
                <Text color={theme.dim}>{truncate(branch.author, 15)}</Text>
              </Box>
            );
          })
        )}
        {displayBranches.length > 20 && (
          <Text color={theme.dim}>  ... and {displayBranches.length - 20} more (use filter to narrow)</Text>
        )}
      </Box>

      <StatusBar
        hints={
          mode === "insert"
            ? [
                { key: "\u2191\u2193", label: "navigate" },
                { key: "\u23CE", label: "checkout" },
                { key: "esc", label: "normal mode" },
              ]
            : [
                { key: "/", label: "filter" },
                { key: "\u2191\u2193", label: "navigate" },
                { key: "\u2192/\u23CE", label: "checkout" },
                { key: "\u2190/esc", label: "back" },
                { key: "q", label: "quit" },
              ]
        }
      />
    </Box>
  );
}
