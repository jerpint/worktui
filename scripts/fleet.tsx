#!/usr/bin/env bun
/**
 * worktui fleet — a live Ink dashboard of all worktui agents.
 *
 * Layout: a status sidebar (every agent + its current action, at a glance) next
 * to a wall of live preview cards (all agents visible at once). Reads every tmux
 * pane tagged @wt_agent (set by wt-spawn.sh) and refreshes on an interval.
 *
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
  note: string; // human-friendly current action ("Bash(bun test)", the approval Q, …)
  preview: string[]; // recent activity lines for the card
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SIDEBAR_W = 36;
const CARD_W = 50;
const CARD_LINES = 5;

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
  // Current state lives at the bottom of the pane — only trust the tail so old
  // scrollback (a past "esc to interrupt") can't masquerade as live activity.
  const tail = peek.split("\n").slice(-12).join("\n");
  // Working signals, any of:
  //  - "esc to interrupt" in the status line
  //  - a live elapsed counter "(2s · …)"  (a finished turn reads "… for 7s", no parens)
  //  - a spinner line: a spinner glyph followed by an "…ing…" verb. This catches the
  //    first frames too, before the elapsed counter appears.
  if (
    /esc to interrupt/.test(tail) ||
    /\(\d+s\b/.test(tail) ||
    /^\s*[✻✶✳✢✺∗◇◆●∘·•][^\n]*…/m.test(tail)
  )
    return "working";
  if (/Do you want|proceed\?|❯ 1\.|1\. Yes|Allow .* to/.test(tail)) return "blocked";
  if (/Claude Code|⏵⏵|\/effort|context left|tokens/.test(peek)) return "idle";
  return "exited";
}

// The most recent "⏺ …" marker is Claude's latest action (a tool call or reply).
function lastAction(peek: string): string {
  const lines = peek.split("\n").map((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^⏺\s+/.test(lines[i])) return lines[i].replace(/^⏺\s+/, "");
  }
  return "";
}

// A short, human-friendly status note per agent.
function statusNote(peek: string, status: Status): string {
  if (status === "blocked") {
    const q = peek.split("\n").reverse().find((l) => /Do you want|proceed\?|Allow .* to/.test(l));
    return (q ? q.trim() : "waiting for approval").slice(0, 30);
  }
  const act = lastAction(peek);
  if (status === "working") return (act || "thinking…").slice(0, 30);
  if (status === "idle") return (act || "standing by").slice(0, 30);
  return "exited";
}

// Keep only real activity lines — drop blanks, box rules, the input prompt,
// and Claude's own status-bar / hint chrome.
function previewLines(peek: string, max: number): string[] {
  return peek
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0)
    .filter((l) => !/^[\s─━│┌┐└┘├┤╭╮╰╯]+/.test(l))
    .filter((l) => !/^\s*❯\s*$/.test(l))
    .filter(
      (l) =>
        !/\d+k\/\d+k|Opus 4|Sonnet|Haiku|context left|⏵⏵|-- INSERT --|shift\+tab|↑ for|for agents|\/effort|accept edits/.test(
          l,
        ),
    )
    .slice(-max);
}

function listAgents(): Agent[] {
  const out = tmux(["list-panes", "-a", "-F", "#{@wt_agent}\t#{pane_id}\t#{window_name}"]);
  const agents: Agent[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [branch, id, window] = line.split("\t");
    if (!branch) continue; // only tagged agent panes
    const peek = tmux(["capture-pane", "-t", id, "-p", "-S", "-60"]);
    const status = classify(peek);
    agents.push({ id, branch, window, status, note: statusNote(peek, status), preview: previewLines(peek, CARD_LINES) });
  }
  return agents;
}

function glyphFor(status: Status, frame: number): string {
  return status === "working" ? SPINNER[frame % SPINNER.length] : STATUS_META[status].glyph;
}

function short(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Compact one-line status row in the sidebar. */
function SidebarRow({ agent, frame, selected }: { agent: Agent; frame: number; selected: boolean }) {
  const meta = STATUS_META[agent.status];
  const glyph = glyphFor(agent.status, frame);
  const name = short(agent.branch.replace(/^.*\//, ""), 14);
  if (selected) {
    const text = ` ${glyph} ${name.padEnd(14)} ${short(agent.note, SIDEBAR_W - 21)}`.padEnd(SIDEBAR_W - 4);
    return (
      <Text backgroundColor={theme.selected} color="#2E3440" bold>
        {text}
      </Text>
    );
  }
  return (
    <Box>
      <Text color={meta.color}>{` ${glyph} `}</Text>
      <Text color={theme.text}>{name.padEnd(15)}</Text>
      <Text color={theme.dim}>{short(agent.note, SIDEBAR_W - 20)}</Text>
    </Box>
  );
}

/** One agent card in the wall. */
function AgentCard({ agent, frame, selected }: { agent: Agent; frame: number; selected: boolean }) {
  const meta = STATUS_META[agent.status];
  const glyph = glyphFor(agent.status, frame);
  const lines = agent.preview.slice(-CARD_LINES);
  const padded = [...lines, ...Array(Math.max(0, CARD_LINES - lines.length)).fill("")];
  // Brightness by state: active sessions read bright, quiet ones recede. The
  // latest line (most recent activity) gets emphasis so you see motion/recency.
  const baseColor = agent.status === "working" ? theme.text : theme.dim;
  const lastColor =
    agent.status === "working" ? theme.active : agent.status === "blocked" ? theme.warning : theme.text;
  const lastIdx = lines.length - 1;
  return (
    <Box
      flexDirection="column"
      borderStyle={selected ? "bold" : "round"}
      borderColor={selected ? theme.selected : agent.status === "blocked" ? theme.warning : theme.spine}
      width={CARD_W}
      height={CARD_LINES + 3}
      paddingX={1}
      marginRight={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Text color={selected ? theme.selected : meta.color} bold>
          {selected ? "▸ " : ""}
          {glyph} {agent.branch}
        </Text>
        <Text color={meta.color}>{meta.label}</Text>
      </Box>
      <Box flexDirection="column">
        {padded.map((l, i) => {
          if (!l) return <Text key={i}> </Text>;
          const isLast = i === lastIdx;
          return (
            <Text key={i} color={isLast ? lastColor : baseColor} bold={isLast} wrap="truncate-end">
              {l}
            </Text>
          );
        })}
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
  const cols = stdout?.columns ?? 100;

  const [agents, setAgents] = useState<Agent[]>(listAgents());
  const [frame, setFrame] = useState(0);
  const [selected, setSelected] = useState(0);
  const sel = Math.min(selected, Math.max(0, agents.length - 1));
  const wallCols = cols - SIDEBAR_W - 3;
  const perRow = Math.max(1, Math.floor(wallCols / (CARD_W + 1)));

  useInput((input, key) => {
    if (input === "q" || key.escape) return exit();
    if (input === "r") return setAgents(listAgents());
    if (input === "j" || key.downArrow) return setSelected((s) => Math.min(s + 1, agents.length - 1));
    if (input === "k" || key.upArrow) return setSelected((s) => Math.max(s - 1, 0));
    if (input === "l" || key.rightArrow) return setSelected((s) => Math.min(s + perRow, agents.length - 1));
    if (input === "h" || key.leftArrow) return setSelected((s) => Math.max(s - perRow, 0));
    if (key.return) jumpTo(agents[sel]);
  });

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
    <Box flexDirection="column" width={cols} paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text color={theme.logo} bold>
          {" "}
          worktui · fleet {SPINNER[frame % SPINNER.length]}
        </Text>
        <Text>
          <Text color={theme.active}>{counts.working} working</Text>
          <Text color={theme.dim}> · </Text>
          <Text color={theme.warning}>{counts.blocked} blocked</Text>
          <Text color={theme.dim}> · </Text>
          <Text color={theme.dim}>{counts.idle} idle </Text>
        </Text>
      </Box>

      {/* Body: status sidebar | wall of cards */}
      <Box marginTop={1}>
        <Box flexDirection="column" width={SIDEBAR_W} borderStyle="round" borderColor={theme.spine} paddingX={1}>
          <Text color={theme.dim}>STATUS</Text>
          <Box flexDirection="column" marginTop={1}>
            {agents.length === 0 ? (
              <Text color={theme.dim}>none yet</Text>
            ) : (
              agents.map((a, i) => <SidebarRow key={a.id} agent={a} frame={frame} selected={i === sel} />)
            )}
          </Box>
        </Box>

        <Box flexGrow={1} flexWrap="wrap" marginLeft={1}>
          {agents.length === 0 ? (
            <Text color={theme.dim}>No agents yet — spawn one with wt-spawn.sh &lt;branch&gt; [context]</Text>
          ) : (
            agents.map((a, i) => <AgentCard key={a.id} agent={a} frame={frame} selected={i === sel} />)
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box>
        <Text color={theme.dim}> h/j/k/l select · ↵ jump to pane · r refresh · q quit · polling 1s</Text>
      </Box>
    </Box>
  );
}

render(<Fleet />);
