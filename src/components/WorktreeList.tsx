import { Box, Text, useInput } from "ink";
import { useState, useEffect, useMemo } from "react";
import { readdirSync, statSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, basename } from "path";
import type { Worktree, Project, View, LaunchTarget } from "../types.js";
import { listWorktrees, getGitRoot, createWorktree, getPRUrl, getRepoUrl } from "../git.js";
import { getSessions } from "../sessions.js";
import { listProjects } from "../projects.js";
import { getWorktreeBase, relativeTime, truncate, fuzzyMatch, branchToFolder } from "../utils.js";
import { getAccessTimes, recordAccess } from "../access.js";
import StatusBar from "./StatusBar.js";
import { theme } from "../theme.js";

type SortKey = "recent" | "date" | "branch" | "status";
type Mode = "insert" | "normal";

interface WorktreeListProps {
  onNavigate: (view: View) => void;
  onLaunch: (target: LaunchTarget) => void;
  onQuit: () => void;
}

export default function WorktreeList({ onNavigate, onLaunch, onQuit }: WorktreeListProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("normal");
  const [filter, setFilter] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [startCwd] = useState(() => process.cwd());
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const root = await getGitRoot();
      // Register this project so it appears in the project picker
      const projectDir = join(getWorktreeBase(), basename(root));
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, ".gitroot"), root);
      const wts = await listWorktrees(root);
      const accessTimes = getAccessTimes();
      for (const wt of wts) {
        const ts = accessTimes[wt.path];
        if (ts) wt.lastAccessed = new Date(ts);
      }
      setWorktrees(wts);
      setProjects(null);
      setError(null);
    } catch {
      // Not in a git repo — show project picker instead
      setProjects(listProjects());
    }
    setLoading(false);
  };

  const selectProject = (project: Project) => {
    // Find the best worktree subdir to chdir into.
    // Prefer last accessed, fall back to first subdirectory,
    // then fall back to the original git root (from .gitroot marker).
    const accessTimes = getAccessTimes();
    let best: { path: string; time: number } | null = null;
    let fallback: string | null = null;

    try {
      for (const child of readdirSync(project.path)) {
        if (child.startsWith(".")) continue;
        const childPath = join(project.path, child);
        try {
          if (!statSync(childPath).isDirectory()) continue;
        } catch { continue; }
        if (!fallback) fallback = childPath;
        const t = accessTimes[childPath];
        if (t && (!best || t > best.time)) {
          best = { path: childPath, time: t };
        }
      }
    } catch {}

    let target = best?.path ?? fallback;
    if (!target) {
      // No worktree subdirs — read the original git root
      try {
        target = readFileSync(join(project.path, ".gitroot"), "utf-8").trim();
      } catch {
        target = project.path;
      }
    }

    process.chdir(target);
    setProjects(null);
    setFilter("");
    setSelected(0);
    load();
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    return [...worktrees].sort((a, b) => {
      if (sortBy === "recent") {
        const aTime = a.lastAccessed?.getTime() ?? 0;
        const bTime = b.lastAccessed?.getTime() ?? 0;
        if (aTime !== bTime) return bTime - aTime;
        return b.commitDate.getTime() - a.commitDate.getTime();
      }
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

  const displayProjects = useMemo(() => {
    if (!projects) return [];
    if (!filter) return projects;
    return projects
      .map((p) => ({ p, score: fuzzyMatch(filter, p.name) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.p);
  }, [projects, filter]);

  const inProjectMode = projects !== null;

  // Clamp selection when filtered list shrinks
  const listLen = inProjectMode ? displayProjects.length : displayWorktrees.length;
  useEffect(() => {
    if (selected >= listLen && listLen > 0) {
      setSelected(listLen - 1);
    }
  }, [listLen]);

  const navigate = (dir: "up" | "down") => {
    const count = listLen;
    if (count === 0) return;
    if (dir === "down") {
      setSelected((s) => (s < count - 1 ? s + 1 : 0));
    } else {
      setSelected((s) => (s > 0 ? s - 1 : count - 1));
    }
  };

  const goToProjects = () => {
    setWorktrees([]);
    setProjects(listProjects());
    setFilter("");
    setSelected(0);
    setMode("normal");
    setError(null);
  };

  const selectedWorktree = displayWorktrees[selected] ?? null;

  // Check if filter text exactly matches an existing branch
  const exactMatch = filter && worktrees.some((wt) => wt.branch === filter);
  const canCreate = filter.trim().length > 0 && !exactMatch;

  const doCreate = async () => {
    const branch = filter.trim();
    if (!branch || creating) return;
    setCreating(true);
    try {
      const gitRoot = await getGitRoot();
      const path = await createWorktree(gitRoot, branch);
      setFilter("");
      setMode("normal");
      onLaunch({ kind: "shell", cwd: path });
    } catch (err: any) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  useInput((input, key) => {
    if (creating) return;

    // Arrow keys always navigate
    if (key.downArrow) {
      if (mode === "insert") {
        setMode("normal");
      } else {
        navigate("down");
      }
      return;
    }
    if (key.upArrow) {
      if (mode === "normal" && selected === 0) {
        setMode("insert");
      } else if (mode === "normal") {
        navigate("up");
      }
      return;
    }

    if (mode === "insert") {
      if (key.escape) {
        setMode("normal");
        return;
      }
      if (key.return) {
        if (inProjectMode) {
          const proj = displayProjects[selected];
          if (proj) selectProject(proj);
        } else if (canCreate) {
          doCreate();
        } else if (displayWorktrees.length > 0) {
          const wt = displayWorktrees[selected];
          if (wt) onNavigate({ kind: "detail", worktree: wt });
        }
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
    if (key.return || input === "l") {
      if (inProjectMode) {
        const proj = displayProjects[selected];
        if (proj) selectProject(proj);
      } else if (selectedWorktree) {
        onNavigate({ kind: "detail", worktree: selectedWorktree });
      }
      return;
    }

    if (input === "q") {
      const currentCwd = process.cwd();
      if (currentCwd !== startCwd) {
        onLaunch({ kind: "shell", cwd: currentCwd });
      } else {
        onQuit();
      }
      return;
    }
    if (input === "/" || input === "i" || (input === "n" && !inProjectMode)) {
      setMode("insert");
      return;
    }

    // Vim nav
    if (input === "j") { navigate("down"); return; }
    if (input === "k") {
      if (selected === 0) {
        setMode("insert");
      } else {
        navigate("up");
      }
      return;
    }

    // Project-mode actions
    if (inProjectMode) {
      if (input === "o") {
        const proj = displayProjects[selected];
        if (proj) selectProject(proj);
      }
      return;
    }

    // h = back to projects
    if (input === "h") {
      goToProjects();
      return;
    }

    if (input === "d") {
      if (selectedWorktree && !selectedWorktree.isMain) {
        onNavigate({ kind: "delete", worktree: selectedWorktree });
      }
    } else if (input === "c") {
      if (selectedWorktree) {
        onLaunch({ kind: "claude", cwd: selectedWorktree.path });
      }
    } else if (input === "s") {
      setSortBy((prev) => {
        const keys: SortKey[] = ["recent", "date", "branch", "status"];
        const idx = keys.indexOf(prev);
        return keys[(idx + 1) % keys.length];
      });
    } else if (input === "o") {
      if (selectedWorktree) onLaunch({ kind: "shell", cwd: selectedWorktree.path });
    } else if (input === "a") {
      if (selectedWorktree) {
        recordAccess(selectedWorktree.path);
        setActivePath(selectedWorktree.path);
        try { process.chdir(selectedWorktree.path); } catch {}
      }
    } else if (input === "f") {
      onNavigate({ kind: "fetch" });
    } else if (input === "r") {
      if (selectedWorktree) {
        getSessions(selectedWorktree.path).then((sessions) => {
          if (sessions.length > 0) {
            onLaunch({ kind: "claude", sessionId: sessions[0].sessionId, cwd: selectedWorktree.path });
          }
        });
      }
    } else if (input === "g") {
      if (selectedWorktree) {
        if (selectedWorktree.isMain) {
          getRepoUrl(selectedWorktree.path).then((url) => {
            if (url) Bun.spawn(["open", url]);
          });
        } else {
          getPRUrl(selectedWorktree.path, selectedWorktree.branch).then((url) => {
            if (url) {
              Bun.spawn(["open", url]);
            } else {
              Bun.spawn(["gh", "pr", "create", "--web"], { cwd: selectedWorktree.path });
            }
          });
        }
      }
    }
  });

  if (loading && worktrees.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading worktrees...</Text>
      </Box>
    );
  }

  if (inProjectMode) {
    const modeLabel = mode === "insert" ? "INSERT" : "NORMAL";
    const modeColor = mode === "insert" ? theme.modeInsert : theme.modeNormal;

    return (
      <Box flexDirection="column" padding={1}>
        <Box flexDirection="column">
          <Box><Text color={theme.logo}>{"        _   "}</Text></Box>
          <Box><Text color={theme.logo}>{"  _ _ _| |_ "}</Text><Text color={theme.bold} bold> worktui</Text></Box>
          <Box><Text color={theme.logo}>{" | | | |  _|"}</Text></Box>
          <Box><Text color={theme.logo}>{" |_____|_|  "}</Text></Box>
        </Box>

        {projects!.length === 0 ? (
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text}>Welcome! No projects here yet.</Text>
            <Text color={theme.dim}>Run <Text color={theme.accent}>wt</Text> from inside a git repo to get started.</Text>
          </Box>
        ) : (
          <>
            <Box marginTop={1}>
              <Text color={theme.dim}>Your projects</Text>
            </Box>
            <Box>
              <Text color={theme.dim}>
                {displayProjects.length}{filter ? `/${projects!.length}` : ""} repos with worktrees{"  "}
              </Text>
              <Text color={modeColor} bold>-- {modeLabel} --</Text>
            </Box>

            <Box marginTop={1}>
              <Text color={mode === "insert" ? theme.modeInsert : theme.dim}>{"> "}</Text>
              <Text color={theme.text}>{filter}</Text>
              {mode === "insert" && <Text color={theme.modeInsert}>|</Text>}
            </Box>

            <Box flexDirection="column">
              {displayProjects.length === 0 ? (
                <Text color={theme.dim}>No matches.</Text>
              ) : (
                displayProjects.map((proj, i) => {
                  const isSelected = i === selected;
                  const cursor = isSelected ? " \u25CF " : "   ";
                  const wts = `${proj.worktreeCount} worktree${proj.worktreeCount !== 1 ? "s" : ""}`;
                  return (
                    <Box key={proj.path}>
                      <Text color={isSelected ? theme.selected : undefined}>{cursor}</Text>
                      <Text color={isSelected ? theme.selectedText : theme.text} bold={isSelected}>
                        {proj.name.padEnd(30)}
                      </Text>
                      <Text color={theme.dim}>{wts}</Text>
                    </Box>
                  );
                })
              )}
            </Box>
          </>
        )}

        <StatusBar
          hints={
            projects!.length === 0
              ? [{ key: "q", label: "quit" }]
              : mode === "insert"
                ? [
                    { key: "\u2191\u2193", label: "navigate" },
                    { key: "\u23CE", label: "open" },
                    { key: "esc", label: "normal mode" },
                  ]
                : [
                    { key: "/", label: "filter" },
                    { key: "j/k", label: "navigate" },
                    { key: "o/\u23CE", label: "open" },
                    { key: "q", label: "quit" },
                  ]
          }
        />
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.error}>Error: {error}</Text>
        <Text dimColor>Make sure you are in a git repository.</Text>
      </Box>
    );
  }

  const cwd = process.cwd();
  const modeLabel = mode === "insert" ? "INSERT" : "NORMAL";
  const modeColor = mode === "insert" ? theme.modeInsert : theme.modeNormal;

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column">
        <Box><Text color={theme.logo}>{"        _   "}</Text></Box>
        <Box><Text color={theme.logo}>{"  _ _ _| |_ "}</Text><Text color={theme.bold} bold> worktui</Text></Box>
        <Box><Text color={theme.logo}>{" | | | |  _|"}</Text></Box>
        <Box><Text color={theme.logo}>{" |_____|_|  "}</Text></Box>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>
          {displayWorktrees.length}{filter ? `/${worktrees.length}` : ""} worktrees
          {"  "}sorted by: {sortBy}{"  "}
        </Text>
        <Text color={modeColor} bold>-- {modeLabel} --</Text>
      </Box>

      {/* Filter / create bar */}
      <Box marginTop={1}>
        <Text color={mode === "insert" ? theme.modeInsert : theme.dim}>{"> "}</Text>
        <Text color={theme.text}>{filter}</Text>
        {mode === "insert" && <Text color={theme.modeInsert}>|</Text>}
        {mode === "insert" && canCreate && !creating && (
          <Text color={theme.dim}> {"\u2192"} worktrees/{branchToFolder(filter)} (enter to create)</Text>
        )}
        {creating && <Text color={theme.modeInsert}> Creating...</Text>}
      </Box>

      {/* Worktree list */}
      <Box flexDirection="column">
        {displayWorktrees.length === 0 ? (
          <Text color={theme.dim}>
            {filter ? "No matches." : "No worktrees found."}
          </Text>
        ) : (
          displayWorktrees.map((wt, i) => {
            const isSelected = i === selected;
            const isActive = activePath ? wt.path === activePath : cwd.startsWith(wt.path);
            const last = i === displayWorktrees.length - 1;
            const first = i === 0;
            const branchDisplay = truncate(wt.branch || "(detached)", 38);
            const time = relativeTime(wt.commitDate);
            const status = wt.isDirty ? "DIRTY" : "clean";
            const statusColor = wt.isDirty ? theme.dirty : theme.clean;
            const sessions =
              wt.sessionCount > 0
                ? `${wt.sessionCount} session${wt.sessionCount > 1 ? "s" : ""}`
                : "\u2014";

            // Git branch diagram prefix
            let glyph: string;
            if (first && last) {
              glyph = "───";
            } else if (first) {
              glyph = "┌──";
            } else if (last) {
              glyph = "└──";
            } else {
              glyph = "├──";
            }

            // Cursor: ● for selected, ◆ for active, blank otherwise
            let cursor: string;
            if (isSelected) {
              cursor = " ● ";
            } else if (isActive) {
              cursor = " ◆ ";
            } else {
              cursor = "   ";
            }

            return (
              <Box key={wt.path}>
                <Text color={isSelected ? theme.selected : isActive ? theme.active : undefined}>
                  {cursor}
                </Text>
                <Text color={theme.spine}>
                  {glyph}{" "}
                </Text>
                <Text color={isSelected ? theme.selectedText : isActive ? theme.activeText : theme.text} bold={isSelected || isActive}>
                  {branchDisplay.padEnd(40)}
                </Text>
                <Text color={theme.dim}>{time.padEnd(10)}</Text>
                <Text color={statusColor}>{status.padEnd(8)}</Text>
                <Text color={theme.dim}>{sessions}</Text>
              </Box>
            );
          })
        )}
      </Box>

      <Box marginTop={1} height={1}>
        {mode !== "insert" && selectedWorktree ? (
          <>
            <Text color={theme.dim}>{" claude: "}</Text>
            <Text color={theme.dim} italic>
              {selectedWorktree.lastSessionSummary
                ? truncate(selectedWorktree.lastSessionSummary, 60)
                : "\u2014"}
            </Text>
          </>
        ) : (
          <Text color={theme.dim}>{" "}</Text>
        )}
      </Box>

      <StatusBar
        hints={
          mode === "insert"
            ? [
                { key: "\u2191\u2193", label: "navigate" },
                { key: "\u23CE", label: canCreate ? "create" : "open" },
                { key: "esc", label: "normal mode" },
              ]
            : [
                { key: "/", label: "filter/create" },
                { key: "j/k", label: "navigate" },
                { key: "h", label: "projects" },
                { key: "a", label: "activate" },
                { key: "o", label: "open" },
                { key: "c", label: "claude" },
                { key: "r", label: "resume" },
                { key: "g", label: "github" },
                { key: "f", label: "fetch" },
                { key: "d", label: "delete" },
                { key: "s", label: "sort" },
                { key: "q", label: "quit" },
              ]
        }
      />
    </Box>
  );
}
