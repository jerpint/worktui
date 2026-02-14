# Claude Code `~/.claude` Filesystem Analysis

> Generated: 2026-02-13

## High-Level Architecture

Everything Claude Code does on your machine gets organized under `~/.claude/`. Total disk usage is about **~195MB**, dominated by shell snapshots (104M) and project session transcripts (65M).

---

## Configuration Files (top-level)

| File | Purpose |
|---|---|
| **`CLAUDE.md`** | Your global instructions, loaded into every session's system prompt. Currently just `always use uv run for memories`. |
| **`settings.json`** | Synced settings: your custom status line command + `alwaysThinkingEnabled: true`. |
| **`settings.local.json`** | Local-only permission rules (auto-allows some Linear MCP tools, `defaults read` bash). |

---

## `projects/` — The Big One (65MB)

This is where **all your session transcripts live**, organized by working directory path (slashes replaced with dashes):

```
projects/
  -Users-jerpint-onix-new-onix-ai/     (17 sessions, largest project)
  -Users-jerpint-claudiobooks/          (9 sessions)
  -Users-jerpint-onix-onix-ai/         (9 sessions)
  -Users-jerpint--claude/               (1 session)
  ... + 10 more (including worktrees)
```

### Inside each project directory:

- **`<session-id>.jsonl`** — Full conversation transcript. Each line is a JSON object (messages, tool calls, file-history snapshots, etc.). The biggest single session is 18MB (`df8d2a1b` in `new-onix-ai`).
- **`<session-id>/`** subdirectories — Contains `subagents/` and `tool-results/` for sessions that spawned agents or had large tool outputs.
- **`sessions-index.json`** — The gold mine for context engineering. Contains metadata for every session: `sessionId`, `firstPrompt`, `summary`, `messageCount`, `created`/`modified` timestamps, `gitBranch`, `projectPath`, and `isSidechain` flag. Only some projects have this (e.g., `claudiobooks` has one).
- **`memory/`** — Per-project auto-memory. Only 3 projects have memory files; most are empty.

### Session transcript format (`.jsonl`)

Each line is a self-contained JSON object. Types include:
- `file-history-snapshot` — snapshots of tracked files at that point in the conversation
- Message objects — user prompts, assistant responses, tool calls and results

---

## `history.jsonl` (523KB, 1,827 lines)

Your **global prompt history** — every message you've ever typed across all projects. Each line has:
- `display` — your prompt text
- `pastedContents` — any pasted content
- `timestamp` — unix timestamp in ms
- `project` — the project path

Useful for searching "what did I ask about X?" across all projects.

---

## `debug/` (20MB)

Timestamped debug logs per session (UUID-named `.txt` files). Contains internal logging (`[DEBUG] [init] configureGlobalMTLS starting`, etc.). Useful for troubleshooting but not for context engineering.

---

## `todos/` (3.1MB, 797 files)

Per-session task lists (`<session-id>-agent-<agent-id>.json`). Most are empty (2 bytes = `[]`). These are the structured task tracker items used during sessions.

---

## `file-history/` (2.1MB)

Backups of files modified during sessions — organized by session ID, containing snapshots of file states before/after edits. Acts as an undo safety net.

---

## `shell-snapshots/` (104MB — largest directory!)

122 shell environment snapshots (`snapshot-zsh-<timestamp>-<random>.sh`). Captures your shell state (env vars, aliases, functions) so Claude Code can inherit your terminal environment. These accumulate and are the biggest space consumer.

---

## Other Directories

| Directory | Size | Purpose |
|---|---|---|
| **`plugins/`** | 5MB | Plugin system: `config.json`, install counts cache, marketplace info |
| **`cache/`** | 92KB | General caching (likely MCP/tool related) |
| **`paste-cache/`** | 36KB | Cached pasted content from clipboard (8 files, hash-named) |
| **`plans/`** | 16KB | Saved plan mode outputs (2 `.md` files with generated names) |
| **`tasks/`** | 28KB | Task tracker state for 3 sessions |
| **`session-env/`** | 0B | Per-session env vars (empty dirs, cleaned up after sessions end) |
| **`statsig/`** | 40KB | Feature flag state |
| **`stats-cache.json`** | 3.5KB | Aggregated usage stats |
| **`commands/`** | — | Symlinks to your custom slash commands (`ship.md` and others) |
| **`ide/`** | 4KB | IDE integration state |
| **`agents/`** | 0B | Empty |
| **`telemetry/`** | 0B | Empty |

---

## `stats-cache.json` — Usage Summary

- **51 total sessions**, **9,804 total messages** since Jan 6, 2026
- Longest session: 1,144 messages over ~12.5 hours (claudiobooks build session)
- Peak day: Jan 27 — 2,406 messages across 8 sessions
- Models used: `claude-opus-4-5` (most history) and `claude-opus-4-6` (recent sessions)
- Peak working hours: 2-3 PM (11 sessions started then)

---

## What's Most Useful for Context Engineering

1. **`projects/<project>/sessions-index.json`** — Quick lookup of all sessions for a project with summaries and first prompts. Not all projects have one yet.

2. **`projects/<project>/<session-id>.jsonl`** — Full transcripts. You can grep these for specific conversations, decisions, or code patterns. They're JSONL so each line parses independently.

3. **`history.jsonl`** — Cross-project searchable prompt history. Good for "when did I work on X?" queries.

4. **`projects/<project>/memory/`** — Persistent memory that gets injected into every session for that project. Currently mostly empty — this is the most underutilized lever you have.

5. **`CLAUDE.md`** — Global instructions loaded every time. Your current one is minimal.

---

## Key Observations

- **Shell snapshots** are the biggest space hog at 104MB and could potentially be pruned.
- **Per-project memory** is largely unused — only 3 of 14 projects have any memory files, and those are empty. This is the biggest opportunity for better context engineering.
- **`sessions-index.json`** only exists in some projects. It provides the fastest way to find relevant past sessions.
- Session transcripts (`.jsonl`) are the richest data source but can be very large (up to 18MB per session).
- The `history.jsonl` is the only cross-project index of your prompts.
