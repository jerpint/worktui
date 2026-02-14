# Claudioscope v0 — Plan

## Context

All Claude Code session data (transcripts, metadata, history, stats) lives in `~/.claude/` but is buried in UUIDs and raw JSONL — usable by machines, not by humans. Claudioscope is a Python tool that parses this data and makes it accessible to both humans (via CLI/HTML) and Claude (via a slash command), enabling long-term project planning and context continuity across sessions.

## Architecture

```
~/claudioscope/
  pyproject.toml              # uv project, dependencies: rich, jinja2
  src/claudioscope/
    __init__.py
    parser.py                 # Core: reads ~/.claude into structured data
    models.py                 # Dataclasses: Project, Session, HistoryEntry, Stats
    cli.py                    # CLI entry point (rich tables)
    html.py                   # HTML report generator (jinja2 template)
    templates/
      report.html             # Single-page HTML template
  context.md                  # Already exists (our filesystem analysis)
```

Plus a Claude slash command:
```
~/.claude/commands/scope.md   # /scope command for in-session queries
```

## Models (`models.py`)

```python
@dataclass
class Session:
    id: str
    project_path: str
    first_prompt: str          # First user message (truncated)
    summary: str               # From sessions-index or generated
    message_count: int
    created: datetime
    modified: datetime
    git_branch: str
    model: str                 # Primary model used
    tools_used: list[str]      # Unique tool names
    duration_seconds: float    # Last timestamp - first timestamp
    is_sidechain: bool

@dataclass
class Project:
    name: str                  # Human-readable (e.g. "claudiobooks")
    path: str                  # Original path (e.g. /Users/jerpint/claudiobooks)
    storage_key: str           # Dir name (e.g. -Users-jerpint-claudiobooks)
    sessions: list[Session]
    has_memory: bool
    memory_files: list[str]

@dataclass
class HistoryEntry:
    prompt: str
    timestamp: datetime
    project: str

@dataclass
class Stats:
    total_sessions: int
    total_messages: int
    first_session_date: datetime
    daily_activity: list[dict]
    model_usage: dict
```

## Parser (`parser.py`)

Single module, reads from `~/.claude/`:

1. **`parse_all() -> dict`** — Main entry, returns `{"projects": [...], "history": [...], "stats": {...}}`
2. **`parse_projects()`** — Scans `projects/` dirs, reads `sessions-index.json` where available, falls back to parsing `.jsonl` headers for metadata
3. **`parse_session_meta(jsonl_path)`** — Reads first + last few lines of a `.jsonl` to extract: first prompt, timestamps, model, message count (without loading full file)
4. **`parse_session_detail(jsonl_path)`** — Full parse: all messages, tool calls, files touched (only called on demand, not during bulk scan)
5. **`parse_history()`** — Reads `history.jsonl`
6. **`parse_stats()`** — Reads `stats-cache.json`

Key design choice: **fast by default**. Bulk scanning reads only `sessions-index.json` + first/last lines of `.jsonl` files. Full transcript parsing is opt-in per session.

## CLI (`cli.py`)

Entry point: `uv run claudioscope <command>`

### Commands:

**`projects`** — List all projects with session counts, last active date
```
Project              Sessions  Last Active   Branch
claudiobooks              9   Jan 27 2026   main
onix/new-onix-ai         17   Feb 13 2026   feature/x
onix/onix-ai              9   Feb 13 2026   main
...
```

**`timeline [--days N]`** — Cross-project chronological view
```
Feb 13  onix/onix-ai          "hey claude, explore ~/.claude..."     47KB
Feb 11  onix/new-onix-ai      "implement the slack integration..."   18MB
Feb 11  claudiobooks           "add batch processing for..."          1.9MB
...
```

**`project <name>`** — All sessions for a project with summaries
```
Project: claudiobooks (9 sessions, Jan 6 - Jan 27 2026)

#  Date       Branch                        Summary                          Msgs
1  Jan 06     —                             Creative Commons and PD Books      20
2  Jan 25     main                          Build audiobook podcast platform   73
3  Jan 26     add/alices-adventures...      Alice in Wonderland Added          12
...
```

**`session <id-prefix>`** — Session detail (supports partial UUID match)
```
Session: 58c874ab (claudiobooks)
Date: Jan 25-26 2026 | Duration: 12.5h | Messages: 73 | Model: opus-4-5

First prompt: "were going to build something together - claudiobooks..."

Tools used: Bash(42), Write(15), Read(8), Glob(4), Edit(3), Grep(1)

Key prompts:
  1. "were going to build something together..."
  2. "ok lets set up the pipeline..."
  3. "now generate the first audiobook..."
  ...
```

**`stats`** — Usage statistics summary

**`report`** — Generate HTML report to `~/claudioscope/report.html` and open it

## HTML Report (`html.py` + `templates/report.html`)

Single-page HTML with inline CSS (no external deps), containing:
- **Contribution graph** — GitHub-style heatmap of daily activity (messages or sessions). Shows at a glance how much of a power user you are. Color intensity = message count for that day. Nice-to-have: hover tooltips with details.
- Project index table (sortable)
- Timeline view (chronological list)
- Stats dashboard (model usage breakdown, peak hours bar chart)
- Links/anchors to jump between sections

Uses Jinja2 for templating. The parser feeds data, Jinja2 renders it.

## Claude Slash Command (`~/.claude/commands/scope.md`)

```markdown
---
description: Browse Claude Code session history and project context with claudioscope
---

Run claudioscope to answer the user's question about their session history.

Available commands (run via `uv run claudioscope <cmd>` from ~/claudioscope/):
- `projects` — list all projects
- `timeline` — cross-project chronological view
- `project <name>` — sessions for a specific project
- `session <id>` — session detail
- `stats` — usage statistics
- `report` — generate HTML report

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

`uv run claudioscope audit [--fix]`

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

1. **Scaffold project** — `pyproject.toml` with deps (rich, jinja2), src layout
2. **Models** — dataclasses in `models.py`
3. **Parser** — `parser.py` with fast metadata extraction
4. **CLI** — `cli.py` with all subcommands using rich for tables
5. **HTML** — `html.py` + `templates/report.html` with Jinja2
6. **Slash command** — `~/.claude/commands/scope.md`
7. **Test** — run each CLI command, generate HTML report, verify `/scope` works

## Verification

1. `uv run claudioscope projects` — should list 14 projects with correct session counts
2. `uv run claudioscope timeline --days 30` — should show recent sessions chronologically
3. `uv run claudioscope project claudiobooks` — should show 9 sessions with summaries
4. `uv run claudioscope session 58c874ab` — should show the long claudiobooks session
5. `uv run claudioscope report` — should generate and open `report.html`
6. `/scope projects` — should work as a Claude Code slash command
