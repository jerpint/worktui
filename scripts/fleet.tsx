#!/usr/bin/env bun
/**
 * worktui fleet — a live Ink dashboard of all worktui agents.
 *
 * Reads every tmux pane tagged with the @wt_agent option (set by wt-spawn.sh),
 * peeks at its recent output to guess status, and renders a delightful,
 * Nord-themed preview wall that refreshes on an interval.
 *
 * Run it standalone (e.g. in the hq overview pane):
 *   bun run ~/worktui/scripts/fleet.tsx
 */
import React, { useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import { theme } from "../src/theme.ts";

type Status = "working" | "blocked" | "idle" | "exited";

interface Agent {
  id: string; // tmux pane id, e.g. %712
  branch: string; // @wt_agent value
  window: string; // tmux window name
  status: Status;
  preview: string[]; // recent activity lines
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const STATUS_META: Record<Status, { glyph: string; color: string; label: string }> = {
  working: { glyph: "", color: theme.active, label: "churning" },
  blocked: { glyph: "⏳", color: theme.warning, label: "BLOCKED" },
  idle: { glyph: "○", color: theme.dim, label: "idle" },
  exited: { glyph: "✗", color: theme.error, label: "exited" },
};

function tmux(args: string[]): string {
  const p = Bun.spawnSync(["tmux", ...args]);
  return p.success ? new TextDecoder().decode(p.stdout) : "";
}

function classify(peek: string): Status {
  if (/esc to interrupt/.test(peek)) return "working";
  if (/Do you want|proceed\?|❯ 1\.|1\. Yes|Allow .* to/.test(peek)) return "blocked";
  if (/Claude Code|⏵⏵|\/effort|context left|tokens/.test(peek)) return "idle";
  return "exited";
}

// Pull the last few meaningful lines (drop blanks, box borders, the input prompt).
function previewLines(peek: string, max: number): string[] {
  return peek
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0)
    .filter((l) => !/^[\s─━│┌┐└┘├┤╭╮╰╯]+$/.test(l))
    .filter((l) => !/^\s*❯\s*$/.test(l))
    .filter((l) => !/-- INSERT --|shift\+tab|for agents/.test(l))
    .slice(-max);
}

function listAgents(): Agent[] {
  const out = tmux(["list-panes", "-a", "-F", "#{@wt_agent}\t#{pane_id}\t#{window_name}"]);
  const agents: Agent[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [branch, id, window] = line.split("\t");
    if (!branch) continue; // only tagged agent panes
    const peek = tmux(["capture-pane", "-t", id, "-p", "-S", "-40"]);
    agents.push({ id, branch, window, status: classify(peek), preview: previewLines(peek, 4) });
  }
  return agents;
}

function AgentCard({ agent, frame, selected }: { agent: Agent; frame: number; selected: boolean }) {
  const meta = STATUS_META[agent.status];
  const glyph = agent.status === "working" ? SPINNER[frame % SPINNER.length] : meta.glyph;
  const borderColor = selected
    ? theme.selected
    : agent.status === "blocked"
      ? theme.warning
      : theme.spine;
  return (
    <Box
      flexDirection="column"
      borderStyle={selected ? "bold" : "round"}
      borderColor={borderColor}
      width={46}
      paddingX={1}
      marginRight={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Text color={selected ? theme.selected : meta.color} bold>
          {selected ? "▸ " : ""}{glyph} {agent.branch}
        </Text>
        <Text color={meta.color}>{meta.label}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {agent.preview.length === 0 ? (
          <Text color={theme.dim}>—</Text>
        ) : (
          agent.preview.map((l, i) => (
            <Text key={i} color={theme.dim} wrap="truncate-end">
              {l}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

// Switch the tmux client to an agent's window + pane (a pane id resolves to its window).
function jumpTo(agent?: Agent) {
  if (!agent) return;
  tmux(["select-window", "-t", agent.id]);
  tmux(["select-pane", "-t", agent.id]);
}

function Fleet() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [agents, setAgents] = useState<Agent[]>(listAgents());
  const [frame, setFrame] = useState(0);
  const [selected, setSelected] = useState(0);
  const sel = Math.min(selected, Math.max(0, agents.length - 1));

  useInput((input, key) => {
    if (input === "q" || key.escape) return exit();
    if (input === "r") return setAgents(listAgents());
    if (input === "j" || key.downArrow) return setSelected((s) => Math.min(s + 1, agents.length - 1));
    if (input === "k" || key.upArrow) return setSelected((s) => Math.max(s - 1, 0));
    if (key.return) jumpTo(agents[sel]);
  });

  // Fast tick for the spinner; slower poll for the (more expensive) tmux reads.
  useEffect(() => {
    const spin = setInterval(() => setFrame((f) => f + 1), 90);
    const poll = setInterval(() => setAgents(listAgents()), 1000);
    return () => {
      clearInterval(spin);
      clearInterval(poll);
    };
  }, []);

  const counts = {
    working: agents.filter((a) => a.status === "working").length,
    blocked: agents.filter((a) => a.status === "blocked").length,
    idle: agents.filter((a) => a.status === "idle").length,
  };

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} width={stdout?.columns ?? 100}>
      <Box justifyContent="space-between">
        <Text color={theme.logo} bold>
          worktui · fleet {SPINNER[frame % SPINNER.length]}
        </Text>
        <Text color={theme.dim}>{agents.length} agent(s)</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={theme.active}>{counts.working} working</Text>
        <Text color={theme.dim}> · </Text>
        <Text color={theme.warning}>{counts.blocked} blocked</Text>
        <Text color={theme.dim}> · </Text>
        <Text color={theme.dim}>{counts.idle} idle</Text>
      </Box>

      {agents.length === 0 ? (
        <Text color={theme.dim}>No agents yet — spawn one with wt-spawn.sh &lt;branch&gt; [context]</Text>
      ) : (
        <Box flexWrap="wrap">
          {agents.map((a, i) => (
            <AgentCard key={a.id} agent={a} frame={frame} selected={i === sel} />
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.dim}>j/k select · ↵ jump to pane · r refresh · q quit · polling 1s</Text>
      </Box>
    </Box>
  );
}

render(<Fleet />);
