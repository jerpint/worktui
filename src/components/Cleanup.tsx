import { Box, Text, useInput } from "ink";
import { useState, useEffect } from "react";
import type { Worktree } from "../types.js";
import { listWorktrees, getGitRoot, removeWorktree, deleteBranch } from "../git.js";
import { relativeTime, truncate } from "../utils.js";
import StatusBar from "./StatusBar.js";

interface CleanupProps {
  onBack: () => void;
  onQuit: () => void;
}

export default function Cleanup({ onBack, onQuit }: CleanupProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selected, setSelected] = useState(0);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteBranches, setDeleteBranches] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorktrees();
  }, []);

  const loadWorktrees = async () => {
    setLoading(true);
    try {
      const root = await getGitRoot();
      const wts = await listWorktrees(root);
      // Exclude main worktree
      setWorktrees(wts.filter((w) => !w.isMain));
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const clean = worktrees.filter((w) => !w.isDirty);
  const dirty = worktrees.filter((w) => w.isDirty);

  useInput((input, key) => {
    if (deleting) return;

    if (result) {
      if (key.escape || key.return) {
        onBack();
      }
      return;
    }

    if (key.escape || key.leftArrow) {
      onBack();
      return;
    }
    if (input === "q") {
      onQuit();
      return;
    }

    // Vim navigation over clean items
    const count = clean.length;
    if (count > 0) {
      if (input === "j" || key.downArrow) {
        setSelected((s) => (s < count - 1 ? s + 1 : 0));
      } else if (input === "k" || key.upArrow) {
        setSelected((s) => (s > 0 ? s - 1 : count - 1));
      }
    }

    if (input === " " && clean[selected]) {
      setToggled((prev) => {
        const next = new Set(prev);
        const path = clean[selected].path;
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    } else if (input === "a") {
      // Toggle all
      if (toggled.size === clean.length) {
        setToggled(new Set());
      } else {
        setToggled(new Set(clean.map((w) => w.path)));
      }
    } else if (input === "b") {
      setDeleteBranches((v) => !v);
    } else if (key.return && toggled.size > 0) {
      doCleanup();
    }
  });

  const doCleanup = async () => {
    setDeleting(true);
    setError(null);
    let removed = 0;
    try {
      const gitRoot = await getGitRoot();
      for (const wt of clean.filter((w) => toggled.has(w.path))) {
        try {
          await removeWorktree(gitRoot, wt.path);
          if (deleteBranches && wt.branch) {
            try {
              await deleteBranch(gitRoot, wt.branch);
            } catch {}
          }
          removed++;
        } catch {}
      }
      setResult(`Removed ${removed} worktree${removed !== 1 ? "s" : ""}.`);
    } catch (err: any) {
      setError(err.message);
    }
    setDeleting(false);
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading worktrees...</Text>
      </Box>
    );
  }

  if (result) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">{result}</Text>
        <StatusBar hints={[{ key: "esc/\u23CE", label: "back" }]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Cleanup Worktrees</Text>

      {clean.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text dimColor>Clean (space to toggle):</Text>
          </Box>
          <Box flexDirection="column">
            {clean.map((wt, i) => {
              const isSelected = i === selected;
              const isChecked = toggled.has(wt.path);
              const prefix = isSelected ? ">" : " ";
              return (
                <Box key={wt.path}>
                  <Text color={isSelected ? "green" : undefined} bold={isSelected}>
                    {prefix} [{isChecked ? "x" : " "}]{" "}
                  </Text>
                  <Text color={isSelected ? "green" : "white"}>
                    {truncate(wt.branch, 45).padEnd(47)}
                  </Text>
                  <Text dimColor>{relativeTime(wt.commitDate)}</Text>
                </Box>
              );
            })}
          </Box>
        </>
      )}

      {dirty.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text dimColor>Dirty (cannot remove):</Text>
          </Box>
          <Box flexDirection="column">
            {dirty.map((wt) => (
              <Box key={wt.path}>
                <Text dimColor>
                  {"      "}
                  {truncate(wt.branch, 45).padEnd(47)}
                  {relativeTime(wt.commitDate)}
                </Text>
              </Box>
            ))}
          </Box>
        </>
      )}

      {clean.length === 0 && dirty.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>No worktrees to clean up.</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text>
          <Text color={deleteBranches ? "green" : "gray"}>
            [{deleteBranches ? "x" : " "}]
          </Text>
          {" "}Also delete local branches
        </Text>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {deleting && (
        <Box marginTop={1}>
          <Text color="yellow">Removing worktrees...</Text>
        </Box>
      )}

      <StatusBar
        hints={[
          { key: "\u2191\u2193", label: "navigate" },
          { key: "space", label: "toggle" },
          { key: "a", label: "all" },
          { key: "b", label: "branches" },
          { key: "\u23CE", label: "confirm" },
          { key: "\u2190/esc", label: "cancel" },
        ]}
      />
    </Box>
  );
}
