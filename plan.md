# Claudioscope v0 — Plan

## Context

All Claude Code session data (transcripts, metadata, history, stats) lives in `~/.claude/` but is buried in UUIDs and raw JSONL — usable by machines, not by humans. Claudioscope is an interactive TUI built with Ink (React for CLIs) that parses this data and makes it browsable, enabling long-term project planning and context continuity across sessions.

## Tech Stack

- **Runtime**: Bun
- **TUI framework**: Ink (React renderer for terminals)
- **Language**: TypeScript
- **Styling**: Ink's built-in `<Box>` (Flexbox) + `<Text>` (Chalk-based colors)

Anyone can use npm/pnpm instead of bun — no lock-in beyond the lockfile.

## Architecture

```
~/claudioscope/
  package.json
  tsconfig.json
  src/
    index.tsx               # Entry point — renders <App />
    parser.ts               # Core: reads ~/.claude/ into structured data
    types.ts                # TypeScript interfaces
    components/
      App.tsx               # Root — manages view state / navigation
      ProjectList.tsx       # List of all projects (home view)
      ProjectDetail.tsx     # Sessions for a selected project
      SessionDetail.tsx     # Single session deep-dive
      Timeline.tsx          # Cross-project chronological view
      Stats.tsx             # Usage statistics dashboard
    hooks/
      useClaudeData.ts      # Load + cache parsed data
  context.md                # Filesystem analysis (already exists)
  plan.md                   # This file
```

Plus a Claude slash command:
```
~/.claude/commands/scope.md   # /scope command for in-session queries
```

## Types (`types.ts`)

```typescript
interface Session {
  id: string;
  projectPath: string;
  firstPrompt: string;        // First user message (truncated)
  summary: string;             // From sessions-index or generated
  messageCount: number;
  created: Date;
  modified: Date;
  gitBranch: string;
  model: string;               // Primary model used
  toolsUsed: string[];         // Unique tool names
  durationSeconds: number;     // Last timestamp - first timestamp
  isSidechain: boolean;
}

interface Project {
  name: string;                // Human-readable (e.g. "claudiobooks")
  path: string;                // Original path (e.g. /Users/jerpint/claudiobooks)
  storageKey: string;          // Dir name (e.g. -Users-jerpint-claudiobooks)
  sessions: Session[];
  hasMemory: boolean;
  memoryFiles: string[];
}

interface HistoryEntry {
  prompt: string;
  timestamp: Date;
  project: string;
}

interface Stats {
  totalSessions: number;
  totalMessages: number;
  firstSessionDate: Date;
  dailyActivity: { date: string; count: number }[];
  modelUsage: Record<string, number>;
}

interface ClaudeData {
  projects: Project[];
  history: HistoryEntry[];
  stats: Stats;
}
```

## Parser (`parser.ts`)

Single module, reads from `~/.claude/`:

1. **`parseAll(): ClaudeData`** — Main entry, returns all parsed data
2. **`parseProjects()`** — Scans `projects/` dirs, reads `sessions-index.json` where available, falls back to parsing `.jsonl` headers for metadata
3. **`parseSessionMeta(jsonlPath)`** — Reads first + last few lines of a `.jsonl` to extract: first prompt, timestamps, model, message count (without loading full file)
4. **`parseSessionDetail(jsonlPath)`** — Full parse: all messages, tool calls, files touched (only called on demand, not during bulk scan)
5. **`parseHistory()`** — Reads `history.jsonl`
6. **`parseStats()`** — Reads `stats-cache.json`

Key design choice: **fast by default**. Bulk scanning reads only `sessions-index.json` + first/last lines of `.jsonl` files. Full transcript parsing is opt-in per session.

## TUI Views

Entry point: `bun run src/index.tsx`

### Navigation

Drill-down model to start — keep it simple:

```
ProjectList → ProjectDetail → SessionDetail
                ↕
             Timeline
                ↕
              Stats
```

Keyboard-driven: arrow keys to navigate lists, enter to drill in, escape/backspace to go back, tab or number keys to switch top-level views. We'll figure out the exact keybindings as we build.

### Views:

**ProjectList** (home) — All projects with session counts, last active date
```
  claudioscope

  Project                Sessions   Last Active    Branch
▸ claudiobooks                 9   Jan 27 2026    main
  onix/new-onix-ai            17   Feb 13 2026    feature/x
  onix/onix-ai                 9   Feb 13 2026    main
  ...

  ↑↓ navigate  ⏎ open  t timeline  s stats  q quit
```

**ProjectDetail** — Sessions for a selected project
```
  claudiobooks — 9 sessions (Jan 6 – Jan 27 2026)

  #  Date       Branch                  Summary                           Msgs
  1  Jan 06     —                       Creative Commons and PD Books       20
▸ 2  Jan 25     main                    Build audiobook podcast platform    73
  3  Jan 26     add/alices-adventures   Alice in Wonderland Added           12
  ...

  ↑↓ navigate  ⏎ open session  esc back  q quit
```

**SessionDetail** — Single session deep-dive
```
  Session 58c874ab — claudiobooks
  Jan 25–26 2026 | 12.5h | 73 messages | opus-4-5

  First prompt: "were going to build something together — claudiobooks..."

  Tools: Bash(42) Write(15) Read(8) Glob(4) Edit(3) Grep(1)

  Key prompts:
    1. "were going to build something together..."
    2. "ok lets set up the pipeline..."
    3. "now generate the first audiobook..."

  esc back  q quit
```

**Timeline** — Cross-project chronological view
```
  Timeline (last 30 days)

  Date     Project                Prompt                              Size
  Feb 13   onix/onix-ai          "hey claude, explore ~/.claude..."   47KB
  Feb 11   onix/new-onix-ai      "implement the slack integration…"   18MB
  Feb 11   claudiobooks           "add batch processing for..."        1.9MB
  ...

  ↑↓ navigate  ⏎ open session  p projects  s stats  q quit
```

**Stats** — Usage statistics dashboard
```
  Stats — 51 sessions, 9,804 messages since Jan 6 2026

  Activity (last 60 days):
  ▁▂▁▃▅▇▃▁▂▄▅▂▁▃▂▁▁▂▅▃▁▁▂▁▃▁▂▄▃▂   (sparkline or mini bar chart)

  Models:
    claude-opus-4-5    38 sessions
    claude-opus-4-6    13 sessions

  Peak hours:  2–3 PM (11 sessions)
  Longest session: 1,144 msgs / 12.5h (claudiobooks)

  p projects  t timeline  q quit
```

## HTML Report

No built-in HTML generator — just ask Claude `/scope report` and let it generate one from the parsed data. One less thing to maintain.

## Claude Slash Command (`~/.claude/commands/scope.md`)

```markdown
---
description: Browse Claude Code session history and project context with claudioscope
---

Run claudioscope to answer the user's question about their session history.

Available commands (run via `bun run ~/claudioscope/src/index.tsx <cmd>`):
- `projects` — list all projects
- `timeline` — cross-project chronological view
- `project <name>` — sessions for a specific project
- `session <id>` — session detail
- `stats` — usage statistics

Based on $ARGUMENTS, run the appropriate claudioscope command and present
the results. If no arguments given, run `projects` for an overview.
```

## Future: Security Audit (`claudioscope audit`)

### The Problem

`~/.claude/projects/` contains full session transcripts in plaintext JSONL. Secrets can leak into transcripts via two paths:

1. **Tool output** — When Claude runs a command that touches env vars, reads a `.env` file, etc. Claude Code **does** scrub known patterns (e.g. `OPENAI_API_KEY=sk-...` → `OPENAI_API_KEY=***`) at the Bash tool level before logging. But this is pattern-based and won't catch everything.

2. **User input (NOT scrubbed)** — If a user pastes a secret directly into the chat (e.g. "here's my key: sk-abc123, update my .env"), it is stored **verbatim** in both the session transcript `.jsonl` AND `history.jsonl`. There is no scrubbing on user messages. This is the bigger risk since users may not realize their prompts are persisted in plaintext.

This means **65MB of transcripts** + **523KB of prompt history** may contain API keys, database URLs, passwords, tokens, and other secrets.

Some transcripts have `644` permissions (world-readable), though most are `600`.

### The `audit` Command

`bun run src/index.tsx audit [--fix]`

Scans all session transcripts **and user prompt history** for potential secrets using pattern matching:
- API key patterns (e.g. `sk-`, `AKIA`, `ghp_`, `xoxb-`, bearer tokens)
- Connection strings (`postgres://`, `mysql://`, `redis://`, `mongodb://`)
- `.env` file content patterns (`KEY=value` with high-entropy values)
- Base64-encoded credentials
- Common secret variable names (`PASSWORD`, `SECRET`, `TOKEN`, `API_KEY`)

Output:
```
Found 23 potential secrets across 8 sessions:

  Session 58c874ab (claudiobooks, Jan 25):
    Line 412: OPENAI_API_KEY=sk-proj-...  [API Key]
    Line 891: DATABASE_URL=postgres://... [Connection String]

  Session d7109afe (onix-ai, Jan 15):
    Line 34:  SUPABASE_KEY=eyJhbG...     [JWT Token]
    ...
```

Scan targets (all checked by default):
- `projects/*/*.jsonl` — session transcripts (tool output leaks)
- `projects/*/subagents/*.jsonl` — subagent transcripts
- `projects/*/tool-results/*.txt` — stored tool outputs
- `history.jsonl` — **all user prompts** across all projects (user input leaks)

Options:
- `--fix` — Redact found secrets in-place (replace with `[REDACTED]`)
- `--permissions` — Also fix file permissions to `600` for any that are too open
- `--json` — Machine-readable output for scripting
- `--history-only` — Only scan `history.jsonl` (fast check for pasted secrets)

### Prerequisite for Sync

The audit command is a hard prerequisite before any sync feature. The workflow would be:
1. `claudioscope audit --fix` — scrub secrets from local transcripts
2. Then sync cleaned data to shared storage

## Future: Cross-Machine Sync

### The Problem

Session history is local to each machine. If you use Claude Code on multiple machines (or the web), there's no unified view of your work.

### Architecture Options

**Option A: Git-based sync**
- A dedicated private git repo stores exported session metadata (not full transcripts by default)
- Each machine runs `claudioscope sync push` to export its session index + summaries
- `claudioscope sync pull` merges indexes from other machines
- Full transcripts opt-in per session (`claudioscope sync push --include-transcript <id>`)
- Requires `audit --fix` before any push

**Option B: Metadata-only sync**
- Only sync `sessions-index.json` files and computed summaries (no raw transcripts)
- Much lighter, avoids most secret exposure risk
- Lose the ability to deep-dive into remote sessions, but keep the timeline/overview

**Option C: Cloud storage with encryption**
- Encrypt transcripts before uploading to S3/GCS
- Decrypt on pull
- Most secure but more infrastructure

### Web Sessions Gap

Claude.ai web sessions are stored server-side with no local export. This is a gap that depends on Anthropic providing an export/API feature. For now, claudioscope can only scope local Claude Code sessions.

## Implementation Steps

1. **Scaffold project** — `package.json` with deps (ink, react), tsconfig, bun setup
2. **Types** — interfaces in `types.ts`
3. **Parser** — `parser.ts` with fast metadata extraction
4. **TUI components** — Start with `App.tsx` + `ProjectList.tsx`, iterate from there
5. **Navigation** — Wire up drill-down between views
6. **Remaining views** — `ProjectDetail`, `SessionDetail`, `Timeline`, `Stats`
7. **Slash command** — `~/.claude/commands/scope.md`
8. **Test** — Run the TUI against real `~/.claude/` data, verify navigation and data accuracy

## Verification

1. `bun run src/index.tsx` — TUI launches, shows project list with correct session counts
2. Arrow keys + enter — Navigate into a project, see its sessions
3. Enter on a session — See session detail with first prompt, tools, duration
4. `t` key — Timeline view shows recent sessions across all projects
5. `s` key — Stats view shows usage summary
6. `q` key — Quit cleanly
7. `/scope projects` — Works as a Claude Code slash command
