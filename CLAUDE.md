# Claudioscope

Interactive TUI for browsing Claude Code session history from `~/.claude/`.

## Tech Stack

- **Runtime**: Bun
- **TUI**: Ink (React for CLIs)
- **Language**: TypeScript

## Project Structure

```
src/
  index.tsx           # Entry point
  parser.ts           # Reads ~/.claude/ into structured data
  types.ts            # TypeScript interfaces
  components/         # Ink React components (App, ProjectList, etc.)
  hooks/              # Custom React hooks
```

## Setup

- `brew install oven-sh/bun/bun` — install bun
- `bun install` — install dependencies
- `bun run start` — launch the TUI

## Key Files

- `plan.md` — full design doc with architecture, views, and future plans
- `context.md` — analysis of the ~/.claude/ filesystem structure

## Design Principles

- **Fast by default** — bulk scanning reads only session indexes and first/last lines of JSONL, not full transcripts
- **Drill-down navigation** — ProjectList → ProjectDetail → SessionDetail
- **Read-only** — never writes to ~/.claude/
