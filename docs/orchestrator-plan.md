# worktui Orchestrator — Plan

> **Status: PLAN ONLY.** No code in this pass. This doc covers the CLI restructure
> (task 1), the event mechanism (task 2), and the notify/escalation design (task 3),
> all framed around the north star.
>
> Companion: [`telegram-mcp-research.md`](./telegram-mcp-research.md) (channel research).

## North star

A worktui **orchestrator** that manages multiple Claude sessions **while the human is
away from the keyboard**. It must:

1. **See** every live session and what it's doing (the *list* / visibility primitive).
2. **Detect** a child's state changes (idle / waiting-on-permission / finished / errored)
   without manual polling (the *event* mechanism).
3. **React** — auto-approve safe steps, and **escalate out-of-band** (Telegram/Slack)
   only when human input is genuinely needed, ideally letting the human **approve
   remotely**.

---

## Framing — "conductor" vs "cockpit"

Two different products are easy to conflate; keep them distinct:

- **Conductor** — software that coordinates many sessions **hands-off**: watch →
  auto-approve safe steps → escalate only when a human is genuinely needed. This is the
  north star and **what `wt` is building**. The conductor substrate = addressable panes,
  a paired shell pane per session, known worktree paths, and the
  `watch`/`approve`/`deny`/`notify` primitives.
- **Cockpit** — a UI that lets a **human steer** sessions remotely. Anthropic's **Claude
  Code Remote Control** (and, narrowly, **Channels**) are cockpits.

These **compose**: the cockpit is an **optional remote human-in-the-loop layer** on top of
the conductor, **not a competitor**. The conductor logic — the auto-approve policy, the
event stream, the scriptable spawn/send/read/kill primitives, the paired shell pane —
stays `wt`'s job, because no cockpit exposes those. See
[Optional cockpit layers](#optional-cockpit-layers-remote-human-in-the-loop) for how the
native tools slot in.

---

## P0 prerequisite — ship `wt` as a real executable on PATH

**This blocks the entire orchestrator and must land first.**

Today `wt` is **only a shell function**, sourced in `~/.zshrc` via `source ~/worktui/wt.sh`.
It wraps `bun run ~/worktui/src/index.tsx "$@"` and then reads `/tmp/worktui-launch` to
`cd` the parent shell / launch `claude`. Consequences:

- It exists **only in interactive login shells**. Non-login / background / detached
  shells (exactly what an orchestrator and tmux hooks run in) have **no `wt`** →
  background automation cannot call it. Hooks would have to hardcode
  `bun run ~/worktui/src/index.tsx`, which is brittle and bypasses the `Bash(wt:*)`
  allowlist.
- `package.json` already declares `"bin": { "wt": "./src/index.tsx" }`, but the sourced
  **function shadows it** on PATH, so the binary path is effectively unused.

### Why it's a function at all (the `cd` nuance)
The function does one thing a plain executable **cannot**: it `cd`s the *parent* shell
after the TUI exits (the `/tmp/worktui-launch` dance, plus `wt -` for "previous
worktree"). A child process can't change its parent's working directory. So we can't
simply delete the function.

### Decided packaging approach
Split "the tool" from "the interactive shell sugar". This is the concrete, committed plan
(not an options menu):

1. **Ship a real binary on PATH:**
   ```
   bun build --compile src/index.tsx --outfile ~/.local/bin/wt
   ```
   `~/.local/bin` is on PATH for all shells (incl. non-login/background), so hooks and the
   orchestrator resolve `wt` directly with no `bun`-at-call-time dependency.

2. **Keep the `wt()` shell function in `wt.sh` — change ONLY its tool-invocation line.**
   The single edit:
   ```diff
   - bun run ~/worktui/src/index.tsx "$@"
   + command wt "$@"
   ```
   `command wt` bypasses the function itself (no recursion) and invokes the binary on PATH.
   **Every other line of the function stays byte-for-byte identical** — the
   `/tmp/worktui-launch` payload parse, the `shell`/`claude` `cd`+launch dance, and the
   `wt -` previous-worktree `cd`. That half genuinely *requires* a function: a child
   process cannot `cd` its parent shell. We are not rewriting or "thinning" the function;
   we are swapping one line.

3. **Guarantee for the orchestrator:** non-interactive callers (spawn/event scripts, hook
   commands) get the binary directly via PATH — they never rely on the function being
   sourced.

### ⚠️ Hard acceptance criterion — interactive behavior MUST NOT change
The interactive TUI behavior must be **identical to today**. Specifically, these must
behave **exactly as they do now**:
- **`o`** — open shell / `cd` into the worktree
- **`c`** — new Claude session
- **`r`** — resume Claude session
- **`wt -`** — `cd` to the previous worktree

The **only** observable change: **non-interactive shells (hooks/orchestrator) now resolve
`wt` to the binary** instead of having no `wt` at all. If any interactive flow changes, the
change is wrong. (Sanity check that the binary path also works in a clean env:
`env -i /bin/sh -c 'wt sessions list --json'`.)

---

## Task 1 — CLI restructure into noun-verb namespaces

### Motivation
The flat verb set is starting to collide: `wt list`/`ls` means *worktrees*, but we now
also need to list *live sessions/panes*. Rather than bolt on `wt ps`, restructure into
**`wt <noun> <verb>`** groups, keeping every current flat verb as a **backward-compat
alias** (zero breakage).

### Proposed command tree

```
wt worktrees   (alias: wt wt)
  list            [--json]            # = current `wt list` / `ls`
  create <branch> [--pr]             # = current `wt create` / `-b`
  delete <branch> [--force] [--branch]  # = current `wt delete` / `rm`
  clean           [--dry-run]        # = current `wt clean` / `cleanup`
  remote          [--json]           # = current `wt remote`
  status                             # = current `wt status`
  pr <branch>                        # = current `wt pr`

wt sessions    (alias: wt sess)
  list            [--json]           # LIVE panes (NEW) — branch · worktree path · window
                                     #   · claude pane · shell pane · state · working-on
  history [<branch>] [--json]        # = current `wt sessions` (Claude session history)
  spawn  [--right CMD] <branch> [ctx...]   # = current `wt spawn`
  send   <pane> <text...>            # = current `wt send`
  read   <pane> [lines]              # = current `wt read`
  kill   <branch> [--worktree|--branch]    # = current `wt kill`
  state  <pane>                      # NEW (task 2)
  wait   <pane> [--until …] [--timeout N]  # NEW (task 2)
  watch  [--json]                    # NEW (task 2)
  approve <pane> / deny <pane>       # NEW (task 2)
  cd     <id>                        # NEW — chdir parent shell into the session's worktree
  peek   <id> [lines]                # NEW — preview a worktree's state w/o switching to it

wt peek <id> [lines]   (alias for `wt sessions peek`)   # NEW — inspectability shortcut

wt projects
  list            [--json]           # = current `wt projects`

wt notify <text> [--channel telegram|slack|all]   # NEW (task 3)

wt help
```

### `wt sessions list` — the visibility primitive (task 1 deliverable)
One row per **live Claude session** (not historical). Discovery + columns:

- **Discover** panes via `tmux list-panes -a -F '#{pane_id}\t#{pane_current_command}\t#{pane_title}\t#{pane_current_path}\t#{window_index}\t#{window_name}\t#{pane_dead}\t@wt_branch=#{@wt_branch}'`.
  - A pane is a Claude session if `pane_current_command == claude` **or** it carries the
    `@wt_branch` user-option tag we set at spawn (see below).
  - Join the sibling **shell pane** = the other pane in the same window (or tagged
    `@wt_role=shell`).
- **Columns:** `branch · worktree-path · window · claude-pane · shell-pane · state · working-on`.
  - `branch` from `@wt_branch` tag, else window name, else basename of
    `pane_current_path` under `$WORKTUI_DIR`.
  - `worktree-path` — the absolute worktree dir (from `pane_current_path` / the worktree
    record). **First-class**, see inspectability below.
  - `state` from the task-2 classifier (running/idle/permission/done/error).
  - `working-on` from the **pane title** — confirmed live that Claude Code sets the title
    to `<glyph> <current task>` (e.g. `✳ Review current code diff`,
    `⠐ jeremy/chat-tool-aware-prompt-sections`). Fallback: `sessions.ts` lastSummary.
- `--json` emits the structured array the orchestrator consumes.

**Short alias:** `wt ps` → `wt sessions list` (Unix-y "process status"; handy for humans).

### Worktree inspectability — a first-class requirement
A core advantage of `wt` over a cockpit like Remote Control (which **hides** worktree
paths) is that you can jump into a worktree and **see what's actually in it**. Preserve
and strengthen this as conductor logic grows:

- `wt sessions list` **must surface each session's worktree path** (and branch) — done
  above as a first-class column.
- **`wt sessions cd <id>`** — chdir the parent shell into the session's worktree (reuses
  the existing `/tmp/worktui-launch` shell-function dance).
- **`wt peek <id>` / `wt sessions peek <id>`** — preview a worktree's state without
  switching to it (e.g. `git -C <path> status -s` + recent diff + last pane lines), so
  "see what's in it" stays a single keystroke.

`<id>` accepts a branch, a pane id, or a list index — resolved via the `@wt_branch` tags.

### Tagging panes at spawn (registry-in-tmux)
`wt sessions spawn` should tag both panes so the registry lives in tmux (no separate
state file to desync, survives pane-id reuse):

```
tmux set-option -p -t "$CLAUDE_PANE" @wt_branch "$BRANCH"
tmux set-option -p -t "$CLAUDE_PANE" @wt_role   claude
tmux set-option -p -t "$SHELL_PANE"  @wt_branch "$BRANCH"
tmux set-option -p -t "$SHELL_PANE"  @wt_role   shell
```

Discovery still falls back to `cmd=claude` + path-under-`$WORKTUI_DIR` so **manually
launched** Claude sessions also show up (the live tmux scan found several not spawned by
worktui).

### Alias / migration plan
- Router resolves `wt <noun> <verb>` first; if `<noun>` is an old flat verb, dispatch to
  the mapped handler unchanged.
- Keep the full legacy table: `list/ls → worktrees list`, `create/-b → worktrees create`,
  `delete/rm → worktrees delete`, `cleanup/clean → worktrees clean`, `remote`, `status`,
  `pr`, `projects`, `sessions → sessions history`, `spawn/send/read/kill → sessions *`.
- `wt help` prints the new tree with a "legacy aliases still work" footnote.
- **No deprecation removal** in this pass — aliases are permanent-for-now; revisit later.

---

## Task 2 — event mechanism (recommended: **Claude Code hooks primary**, tmux-push fallback)

Goal: an orchestrator reacts to child state changes **without hot-polling**, and worktui
stays a set of thin scripts (no long-lived daemon).

> **Recommendation update (supersedes the earlier tmux-glyph-primary plan).** Claude Code
> **hooks** fire from *inside* the child Claude with **structured JSON** — strictly better
> than scraping pane glyphs for the events Claude itself emits. Make **hooks the PRIMARY**
> mechanism for both event detection and auto-approve; keep the **tmux-push classifier as
> the FALLBACK** for state hooks can't see (the **shell pane**, or sessions started
> without hook config). Hooks do **not** solve inbound remote-reply (still needs a
> listener, see below) or laptop sleep (see [Where the orchestrator runs](#where-does-the-orchestrator-run-always-on-vs-sleep)).

### Layer 0 (PRIMARY) — Claude Code hooks: in-session events + auto-approve
At spawn, inject a hook config into the worktree's `.claude/settings.json` (or
`settings.local.json`) so the child Claude emits structured events and self-approves safe
tools. The hooks worktui cares about:

- **`Notification`** — fires when the session **needs permission** or is **idle-waiting**.
  This is the push signal that "a human (or the conductor) is needed." The hook command
  writes a structured event (branch, pane, kind, the prompt/tool) to the orchestrator's
  event sink (a FIFO / append-only `~/.worktui/events.jsonl` that `wt sessions watch`
  tails — see Layer 3).
- **`Stop` / `SubagentStop`** — "**done / idle**" events (the turn finished). Cleaner than
  inferring "done" from an empty prompt box.
- **`PreToolUse`** — **deterministic in-session auto-approve.** The hook receives the tool
  call as JSON and returns `allow` / `deny` / `ask`. Safe, reversible tools
  (read-only, test, lint, `git status`, etc.) → `allow`; risky ones fall through to
  `ask` (→ a `Notification` → escalation). This is **safer and more precise** than
  scraping the pane and sending `1`: the decision sees the actual tool + args as data,
  and never races the TUI.

Why primary: structured payloads, no glyph/regex brittleness, and auto-approve happens
*before* the tool runs rather than by typing into a prompt after the fact. The policy for
"what's safe" lives in the hook script (generated by `wt`/the skill), keeping `wt` as
mechanism.

> The spawn flow must therefore **write hook config into each worktree** (and the P0
> packaging must make `wt` callable from those hook commands — that's why hooks need the
> real binary on PATH). Sessions a user launched **without** worktui's hook config get no
> hook events — that's exactly the gap the tmux-push fallback covers.

### Layer 1 (FALLBACK) — state classifier: `wt sessions state <pane>`
Single source of truth for "what state is this pane in." Returns one of:
`running | idle | permission | done | error`.

Signals, cheapest first:
1. **Pane title glyph** (free, no capture): braille spinner (`⠐⠂⠄…`) ⇒ `running`; the
   idle/awaiting glyph (`✳`) ⇒ not running.
2. **`pane_dead` / exit status** ⇒ `done` (clean) or `error` (non-zero).
3. **`capture-pane -p`** to disambiguate the silent states:
   - `permission` — prompt box text: "Do you want to proceed?", "Do you want to make this
     edit", numbered "❯ 1. Yes / 2. … / 3. No".
   - `error` — visible error/traceback / "API Error" patterns.
   - `idle` vs `done` — both render the empty prompt box; treat as `idle` unless an exit
     was observed. (See risk note — `done` is the hardest to nail from pane content alone.)

> **Risk / the one thing to prototype first:** reliable `permission` vs `idle` vs `done`
> vs `error` classification from `capture-pane` is the load-bearing assumption. Build a
> tiny corpus of captured frames for each state and lock down the regexes before building
> `wait`/`watch` on top. If title glyphs prove stable across Claude versions, prefer them;
> they're far more robust than scraping the prompt box.

### Layer 2 (FALLBACK) — push signal (no busy-poll): `wt sessions wait <pane> [--until …] [--timeout N]`
At spawn, enable tmux monitoring on the Claude pane:
```
tmux set-option -p -t "$CLAUDE_PANE" monitor-silence 2   # fires when quiet ≥2s
tmux set-option -p -t "$CLAUDE_PANE" monitor-bell on     # Claude rings bell on attention
```
Wire the tmux `alert-silence` / `alert-bell` hooks to `tmux wait-for -S wt_<pane>`. Then
`wt sessions wait` does a **blocking** `tmux wait-for wt_<pane>` (zero CPU) and, on
wake, runs the classifier and prints the resulting state. `--until permission,idle,done`
filters which transitions resolve the wait; `--timeout` guards against a hung child.

Why silence+bell: a Claude pane goes quiet exactly when it's idle, done, or blocked on a
prompt — the moments the orchestrator cares about. The bell is an explicit
"needs-attention" nudge Claude already emits. Classification then disambiguates.

> Verify which of `monitor-bell` vs `monitor-silence` actually fires for a permission
> prompt on this Claude version; keep both as belt-and-suspenders. If neither is reliable,
> the documented fallback is a bounded poll **inside** `wait` (still keeps the orchestrator
> itself poll-free).

### Layer 3 — unified event stream: `wt sessions watch [--json]`
The single feed an orchestrator consumes. It **merges two sources into one pipeline**:
- **hook events** (Layer 0) tailed from the event sink (`~/.worktui/events.jsonl` / FIFO), and
- **tmux state transitions** (Layer 1/2 fallback) for panes without hook coverage,
- plus **inbound listener events** (`source: bot`, see below).

Emits one normalized event per change:
`{ ts, source: hook|tmux|bot, branch, pane, kind, from, to, payload }`. Usage:
```
wt sessions watch --json | while read -r ev; do orchestrator-react "$ev"; done
```

### Layer 4 — act
- **Auto-approve safe steps:** **prefer the `PreToolUse` hook** (Layer 0) — it decides
  before the tool runs and sees the args as JSON. The **fallback** for sessions without
  hooks is `wt sessions approve <pane>` / `deny <pane>` — thin wrappers that send
  `1` / `3` (etc.) to the prompt via the existing send-keys path. Either way the
  *policy* for what's "safe" lives in the orchestrating skill / hook script, **not** in
  `wt` (worktui stays mechanism, not policy). Claude's own allowlist /
  `--dangerously-skip-permissions` can also pre-clear truly safe ops.
- **Escalate:** `wt notify` (next section) when a prompt isn't auto-approvable, or on
  `error`/`done`.

### End-to-end loop (illustrative)
```
wt sessions watch --json | while read -r ev; do
  case "$(state_of "$ev")" in
    permission) safe? && wt sessions approve "$pane" || wt notify "🔐 $branch needs approval: $prompt" ;;
    error)      wt notify "❌ $branch errored" ;;
    done)       wt notify "✅ $branch finished" ;;
  esac
done
```

---

## Task 3 — notify + remote-reply via a **single two-way bot**

> **Key realization:** one bot does **both directions**. A Telegram bot **token** sends
> *and* receives; the authenticated Slack app sends *and* reads replies. So "notify" and
> "inbound listener" are two halves of **one** component, not two integrations. Design the
> whole thing around a single bot per channel.

### Outbound — `wt notify <text> [--channel telegram|slack|all]`
Fire-and-forget. Config via `~/.worktui/notify.env` (mode 600):
- **Telegram:** `WORKTUI_TG_TOKEN`, `WORKTUI_TG_CHAT` → `curl … /sendMessage` (see research note).
- **Slack:** bot token + channel → `chat.postMessage`.

Works even when the child session has **died** (essential for "finished/crashed") — which
is why the backbone is a plain HTTPS call, not an MCP server tied to a live session.

### ⚠️ Hard constraint — inbound CANNOT be pull-only
- **Outbound (orchestrator → human): easy.** A `curl` / MCP send call. Done.
- **Inbound (human reply → orchestrator reacts): there is NO push that wakes a stopped
  agent.** Polling `getUpdates` / `conversations.replies` only works *while a loop is
  already running* — racy, and dead the moment that loop stops. **Pull-only MCP cannot
  push.** Inbound therefore **always** needs a **running listener process** that re-invokes
  the orchestrator on an inbound event. This is a property of the medium, not a tooling gap.

### Inbound listener — closing the human → orchestrator loop
The always-on half of the bot: receive the operator's reply, turn it into an action, and
**emit it into the same `wt sessions watch` stream** (as `source: bot`) so chat events and
tmux/hook events share one pipeline.

**Telegram (DIY, recommended default — one bot, no public URL).** The *same* bot token
used for `sendMessage` also receives via:
- **`getUpdates` long-poll** — a small daemon long-polls Telegram; **no public URL**, works
  behind NAT. This is the Telegram analogue of Slack Socket Mode and the **recommended
  default for a local orchestrator**.
- **`setWebhook`** — Telegram POSTs to a public URL (analogue of Slack Events API); for a
  hosted orchestrator.

The DIY listener loop: long-poll `getUpdates` → **check sender is the allowlisted user** →
map the reply (`approve %50`, `deny`, `push`, `1`) to a pane → call `wt sessions
approve|deny|send <pane> …`. Crucially this is **orchestrator-level — one bot watches ALL
panes** — not per-session, and **not gated by a research preview**. For our use that's
arguably better than the Channels plugin (which is per-session and preview-gated; see
[Optional cockpit layers](#optional-cockpit-layers-remote-human-in-the-loop)).

**Slack (first-class two-way).** The authenticated Slack MCP/app does **both send and
read-thread (replies)**, so Slack is a peer to Telegram for two-way approval. Inbound still
needs a running listener:
- **Socket Mode** (bot token `xoxb-…` + app-level token `xapp-…`, scope
  `connections:write`): outbound websocket, **no public URL** — work-friendly default for a
  local box behind NAT.
- **Events API webhook**: Slack POSTs to a **public URL**; must **verify the signing
  secret** (`X-Slack-Signature` + timestamp, HMAC-SHA256, reject stale → replay guard) and
  answer the `url_verification` challenge. For a hosted orchestrator.

> Rule of thumb (both channels): **no-public-URL mode for a local/laptop orchestrator**
> (Telegram `getUpdates` long-poll / Slack Socket Mode); **webhook mode for a hosted one**
> (Telegram `setWebhook` / Slack Events API).

### Command grammar (inbound)
`approve <token>` · `deny <token>` · `send <token> <text…>` · `push` · `status`.
The listener: trust-gates → parses → resolves `<token>` → acts → emits a `source: bot`
event.

### Correlation — routing a reply back to the right session
Outbound posts **must carry a correlation handle**:
- Embed the **pane id / short token** in the message
  (e.g. `🔐 [oauth-fix · %50] needs approval — reply \`approve %50\` or \`deny %50\``), and/or
- **post per-session in a thread** and scope any in-thread reply to that session's pane
  (read `thread_ts` → the pane it notified for). Threading is the cleanest UX; the explicit
  `<token>` is the robust fallback for replies outside a thread.
- The listener keeps a **token → pane** map and validates the pane still exists (via
  `@wt_branch` tags) before acting.

### Security / trust
- **Authorized sender only:** act exclusively on messages from the approved operator —
  Slack user **`U09DLDZU8DP`** (and the equivalent allowlisted Telegram user id) — in the
  **designated channel/chat**. Ignore (optionally log) everything else, including other
  members and bots.
- **Verify authenticity:** Slack Events API → signing-secret check + stale-timestamp
  rejection; Socket Mode / Telegram long-poll → trust is the app/bot token + per-event
  sender check.
- **No destructive auto-execution from chat:** the grammar is **allowlisted** to safe,
  reversible actions (`approve`/`deny`/`send`/`status`). It must **never** map a chat reply
  to shell execution, worktree/branch deletion, force-push, or
  `--dangerously-skip-permissions`. Destructive intent always requires the human at the
  actual keyboard.
- **Least privilege:** dedicated single-purpose bot/app, minimal scopes, tokens in
  `~/.worktui/notify.env` (mode 600), never committed.

### Scope
Ship **outbound `wt notify` first** (unblocks "tell me when a session needs me"). The
**inbound listener is a separate always-on component**, built next, and **never designed as
polling-from-a-transient-loop**. It must run on an always-on host — see below.

---

## Optional cockpit layers (remote human-in-the-loop)

These are Anthropic-native **cockpits** that **compose with** the conductor as optional
remote-steering layers — not replacements for `wt`'s primitives.

### Claude Code Remote Control (native remote steering + push-to-approve)
Drive a **local** Claude Code session from claude.ai/code or the Claude mobile app; the
session keeps running locally (**code never leaves the machine**).
- **Native push-to-approve:** `/config` → **"Push when actions required"** pushes
  permission prompts + questions to the phone; approve/deny in the app. This directly
  removes the "sessions sit blocked on `1. Yes`" pain.
- **Server mode** `claude remote-control` serves many sessions (default `--capacity 32`);
  **`--spawn worktree`** gives each on-demand session its own git worktree (maps onto wt's
  per-branch isolation). `--spawn same-dir|session` also exist; `w` toggles at runtime.
- **Security posture** (matters for org approval): outbound HTTPS only, **no inbound
  ports**, TLS, short-lived scoped credentials; optional **Trusted Devices** (per-device
  enrollment + biometric, 18h sign-in window) on Team/Enterprise.
- **Requirements:** Claude Code **v2.1.51+** (push needs **v2.1.110+**); **claude.ai auth**
  (NOT API key); Pro/Max/Team/Enterprise; org toggle at
  `claude.ai/admin-settings/claude-code`.
- **Status for Onix:** Remote Control is currently **"disabled by your organization's
  policy"** — a request to enable it has been sent to the org owner.
- **Limitations:** the local process must stay running; it does **not** run work while the
  laptop is **asleep** (auto-reconnects on wake); a >~10 min network outage times the
  session out.
- **What it does NOT give that `wt` does:** the **paired shell pane**, scriptable
  **spawn/send/read/kill** primitives, and the **event/`watch` stream** for building
  auto-approve logic. So **conductor logic stays `wt`'s job**; Remote Control is the
  optional cockpit on top.

### Claude Code Channels (push external events INTO a session)
Research preview (**v2.1.80+**, org-gated, **per-session**, only while the session is
alive). Telegram/Discord/iMessage (+ `fakechat` demo). Install via
`/plugin install <x>@claude-plugins-official`, run with
`claude --channels plugin:<x>@claude-plugins-official`, pair + allowlist. The
**permission-relay** capability can forward prompts for remote approve/deny. Good for
reacting to **outside** events (CI, chat). **Demoted** to an **optional turnkey inbound
bridge** — the orchestrator-level single-bot listener above is preferred for our use
(watches all panes, not preview-gated).

---

## Where does the orchestrator run? (always-on vs sleep)

**The conductor and any inbound listener must run on an ALWAYS-ON host.** A sleeping
laptop suspends *everything* — timers, long-polls, websockets, listeners; `caffeinate`
only prevents **idle** sleep, **not lid-close**. This is also why Remote Control "doesn't
run work while the laptop is asleep."

- **Orchestrator + listener → always-on box** (cloud VM / home server / Raspberry Pi). It
  long-polls Telegram / holds the Slack socket, tails the hook event sink, and drives panes.
- **Workers (the actual sessions/worktrees) can live elsewhere** — but the orchestrator
  must be able to **reach their tmux** (same host, or over SSH to the worker host's tmux
  socket). Implication: either run sessions on the always-on box too, or give the
  orchestrator an SSH path to each worker's tmux + worktree.
- For a laptop-only setup, accept the constraint: the conductor is awake only while the lid
  is open; remote-approve via Remote Control's reconnect-on-wake is the pragmatic fallback.

This choice drives the listener mode selection: an always-on box *can* use webhooks
(public URL); a NAT'd/laptop box should use the no-public-URL modes (Telegram long-poll /
Slack Socket Mode).

---

## Build sequencing (when code starts — not this pass)

1. **P0 packaging** — `bun build --compile src/index.tsx --outfile ~/.local/bin/wt`, and
   change the one tool-invocation line in `wt()` (`bun run …` → `command wt "$@"`); leave
   the rest of the function byte-for-byte. **Hard gate:** interactive `o`/`c`/`r`/`wt -`
   unchanged; only non-interactive shells gain `wt`. *(Blocks everything — hook commands
   and the listener all call the binary.)*
2. **Task 1** — namespaced router + legacy aliases; `wt sessions list` (+ `wt ps`, with
   worktree path); pane tagging at spawn; `wt sessions cd` / `wt peek`.
3. **Task 2a (PRIMARY)** — Claude Code **hooks**: inject `Notification`/`Stop`/`PreToolUse`
   config at spawn → structured events into the sink + in-session auto-approve.
4. **Task 2b (FALLBACK)** — `wt sessions state` (classifier) + `wait` (tmux push) for panes
   without hook coverage and the shell pane; then `watch` as the unified merge → `approve`/`deny`.
5. **Task 3a** — outbound `wt notify` (Telegram + Slack).
6. **Task 3b (separate, always-on)** — the **single-bot inbound listener** (Telegram
   `getUpdates` long-poll / Slack Socket Mode) for remote approve.

---

## Open questions / decisions to confirm

1. **Packaging mechanism:** `bun build --compile` standalone binary (preferred, no runtime
   bun dep) vs `bin` + `bun link` + shebang? Affects install docs and the wrapper.
2. **Namespace aliases:** keep legacy flat verbs **forever** as aliases, or print a soft
   deprecation hint? (Plan assumes keep-forever, no hint.)
3. **Hooks vs tmux balance:** confirm **hooks-primary, tmux-fallback** (this revision).
   Any session we don't spawn (no injected hook config) relies on the tmux classifier — OK?
4. **Auto-approve policy home:** lives in the `PreToolUse` hook script / orchestrating
   skill, with `wt` only exposing mechanism — agreed?
5. **Inbound channel first:** **Telegram single-bot `getUpdates`** (no preview gate, no
   public URL, watches all panes) vs **Slack Socket Mode** (proven read-replies) — which
   to build first?
6. **Where it runs:** is there an always-on host available, or do we accept the laptop /
   Remote-Control-reconnect-on-wake fallback for v1?

---

## Roadmap / future ideas

### Cross-machine session auto-sync (eventually — not first pass)
Goal: all sessions auto-sync so Jeremy can **pick up from any computer** as long as he's
authed. This is about **portable persistent state** (resume *cold* on a new box), distinct
from Remote Control which only drives a **live** session from any device.
- Mechanisms to evaluate: **rsync / Syncthing** of the worktree dirs; a **synced session
  registry / metadata** (branch ↔ worktree ↔ last state ↔ pane history); and the
  **auth/identity model** for "any authed machine."
- Open: conflict handling for dirty worktrees, what counts as canonical, and how the
  conductor rebinds tmux/panes after a machine switch.
```
