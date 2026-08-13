# Telegram in the Anthropic / MCP Ecosystem — State of Play (mid-2026)

> Research note for worktui. Goal: notify a human **out-of-band** when an
> orchestrated child session needs them (idle / waiting on a permission prompt /
> finished / errored), and ideally let them **respond/approve remotely**.

## Bottom line / recommendation

- **Anthropic ships official Telegram support, but as a two-way *channel*, not a
  "notify me" tool.** It lives in `anthropics/claude-plugins-official`
  (`external_plugins/telegram`) as part of the Claude Code **"channels"** research
  preview (needs Claude Code ≥ v2.1.80). A channel lets you **DM a bot to talk *to*
  a running Claude session**, with `reply` / `react` / `edit_message` going
  outbound. It can **relay permission prompts to your phone for remote approve/deny**
  — which is exactly worktui's "escalate when human input is genuinely needed" case.
  It is **not** a fire-and-forget alerter and only works while the host session is alive.
- **For *sending* notifications, MCP is overkill.** A **Telegram bot token + a
  one-line `curl` to `sendMessage`** is the robust, dependency-free path.
- **For worktui:** make the backbone a tiny shell helper (`wt notify`) that `curl`s
  `sendMessage`, called from the event layer (idle/permission/done/error). This works
  even when the child session has died (critical for "finished/crashed"). Layer the
  official **Telegram channel plugin** on top *only* when you want interactive remote
  approval of a permission prompt. Details in §5.

---

## 1. Official Anthropic MCP servers — is there a Telegram/notifications one?

The core reference repo **`modelcontextprotocol/servers`** (educational reference
implementations) currently ships: Everything, Fetch, Filesystem, Git, Memory,
Sequential Thinking, Time. **No Telegram, no generic messaging/notification server.**
Source: https://github.com/modelcontextprotocol/servers

However, Anthropic **does** maintain an official Telegram integration — in a different
repo, as a **Claude Code "channel"**:

- Telegram channel plugin: https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/telegram
- Channels docs: https://code.claude.com/docs/en/channels
- Preview channels: **Telegram, Discord, iMessage** (+ a `fakechat` localhost demo).

A "channel" is an MCP server that **pushes external events *into* a running Claude
session** and replies back over the same transport. The Telegram channel is
**inbound-first**: "DM the bot → message lands in your Claude session; Claude
replies/reacts/edits back." Tools exposed: `reply`, `react`, `edit_message`. Auth is a
**bot token** (from @BotFather) in `~/.claude/channels/telegram/.env`. It does **not**
expose a generic "send an arbitrary notification" tool, and only runs while a session
launched with `--channels` is alive. Its **permission-prompt relay**
(https://code.claude.com/docs/en/channels#relay-permission-prompts) is the part most
relevant to worktui — see §5.

---

## 2. Community Telegram MCP servers

Two camps: **MTProto user-account** servers (full account access — read all chats, act
as *you*) and **Bot API** servers (act as a bot — mostly for sending). Stars/dates are
point-in-time (June 2026) and move fast.

| Repo | Lang/runtime | API | Auth | What it does | Status |
|---|---|---|---|---|---|
| [chigwell/telegram-mcp](https://github.com/chigwell/telegram-mcp) | Python (Telethon) | **MTProto (user)** | `api_id`+`api_hash` + session string | The big one. 80+ tools: read/send/edit, groups, media, contacts, admin | ~1.2k★, active |
| [chaindead/telegram-mcp](https://github.com/chaindead/telegram-mcp) | Go | **MTProto (user)** | `api_id`+`api_hash`, phone auth | dialogs, messages, drafts, read status | ~335★ |
| [dryeab/mcp-telegram](https://github.com/dryeab/mcp-telegram) | Python (Telethon) | **MTProto (user)** | `api_id`+`api_hash`, phone+2FA | send/edit/delete, search, drafts, media; clean CLI | ~246★ |
| [sparfenyuk/mcp-telegram](https://github.com/sparfenyuk/mcp-telegram) | Python | **MTProto (user)** | `api_id`+`api_hash` | read-leaning: dialogs, messages, contacts | ~176★ |
| [harnyk/mcp-telegram-notifier](https://github.com/harnyk/mcp-telegram-notifier) | TS / Node 18+ | **Bot API** | `TELEGRAM_BOT_TOKEN` | purpose-built for **sending** msgs/photos/docs — alerts/deploy/monitoring | small but exactly the notify use-case |
| [guangxiangdebizi/telegram-mcp](https://github.com/guangxiangdebizi/telegram-mcp) | TS / Node | **Bot API** | bot token | send msgs/media, forward/delete, HTML/Markdown | small/new |

Other names seen in registries (Smithery/glama/mcp.so) but **not individually verified**:
`tacticlaunch/mcp-telegram` (MTProto), `tensakulabs/telegram-mcp`,
`n24q02m/better-telegram-mcp` (Bot API + MTProto), `antongsm/mcp-telegram`,
`IQAIcom/mcp-telegram`, `Muhammad18557/telegram-mcp`.

### Config snippets (from each repo's README)

**chigwell/telegram-mcp** (MTProto, most popular):
```json
{
  "mcpServers": {
    "telegram-mcp": {
      "command": "uv",
      "args": ["--directory", "/full/path/to/telegram-mcp", "run", "main.py"],
      "env": {
        "TELEGRAM_API_ID": "your_api_id",
        "TELEGRAM_API_HASH": "your_api_hash",
        "TELEGRAM_SESSION_STRING": "your_session_string"
      }
    }
  }
}
```
Setup: `git clone … && uv sync && uv run session_string_generator.py`.
(The unrelated `telegram-mcp` package on PyPI is **not** this project — install from GitHub.)

**harnyk/mcp-telegram-notifier** (Bot API — the notification-shaped one):
```json
{
  "mcpServers": {
    "telegram-notifier": {
      "command": "telegram-notifier",
      "env": { "TELEGRAM_BOT_TOKEN": "your_token", "TELEGRAM_CHAT_ID": "your_chat_id" }
    }
  }
}
```

---

## 3. Bot API vs MTProto

**Bot API** (`https://api.telegram.org/bot<token>/…`)
- Auth: a **bot token** from **@BotFather** (`123456789:AAH…`). You act as a *bot*.
- A bot can only message a user **after that user has messaged it first** (`/start`).
  Bots can't read arbitrary history or message strangers.
- Trivial: one signed HTTPS URL, no session state.

**MTProto** (user client via Telethon/gramjs/td)
- Auth: `api_id`+`api_hash` from **my.telegram.org/apps**, then phone + 2FA → a
  long-lived **session string**. You act as **your own account** (all chats, contacts,
  history; message anyone).
- Powerful but heavier; the `api_hash` **cannot be revoked**, and userbot automation
  can risk account flags.

**For "send me a notification": use the Bot API.** You only message yourself, the
"user-started-chat" rule is satisfied once, and you skip MTProto's session/credential
burden and account-flag risk. MTProto is only worth it if the agent must *read your
chats* or *act as you* — not the case here.

---

## 4. Wiring Telegram notifications into an agent/MCP workflow

### (a) Simplest path — bot token + direct HTTPS, no MCP at all
One-time setup:
1. DM **@BotFather** → `/newbot` → name + a username ending in `bot`. Copy the token.
2. **Send your bot a message** (`/start`) — mandatory; a bot can't initiate a chat.
3. Get your `chat_id`: `GET https://api.telegram.org/bot<token>/getUpdates` →
   `result[].message.chat.id`. Do once, hardcode. (Group IDs are negative; `@userinfobot` also works.)

Then sending is one call:
```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=Build finished on wt-list-and-events ✅" \
  --data-urlencode "parse_mode=MarkdownV2"
```

### (b) Via an MCP server tool call
Install a Bot API server (e.g. `harnyk/mcp-telegram-notifier`) or the official channel
plugin; the agent calls `send_message(chat_id, text)`. Buys MCP-native tool discovery
and (for the channel) two-way chat — at the cost of a running server. For pure outbound
it adds machinery without adding capability over the curl.

### (c) Considerations
- **chat_id:** via `getUpdates` after messaging the bot, or `@userinfobot`. Numeric,
  stable. Groups/channels are negative and the bot must be a member.
- **User must start the bot first** (Bot API, non-negotiable).
- **Rate limits** (Telegram FAQ): ~**1 msg/sec to one chat** (bursts → HTTP 429 with
  `retry_after`), ~**30 msg/sec** aggregate, ~**20 msg/min** into one group. Fine for
  notifications.
- **Formatting:** `parse_mode=MarkdownV2` (escape `_ * [ ] ( ) ~ \` > # + - = | { } . !`)
  or `HTML` (often easier to generate safely). Omit for plain text.
- **Token security:** the token *is* full bot control. Keep in an env/secrets file
  (mode 600), never commit; revoke via @BotFather if leaked. Prefer a dedicated bot.

---

## 5. Relevance to worktui (tmux orchestrator notifications)

worktui's north star: an **orchestrator that manages multiple sessions while the human
is away** — auto-approve safe steps, and **escalate out-of-band only when human input
is genuinely needed**. Two distinct needs:

**(A) Outbound alert ("a session needs you / finished / crashed") — fire-and-forget.**
Recommended: a tiny `wt notify "<msg>"` helper that `curl`s `sendMessage`.
```bash
#!/usr/bin/env bash
# wt-notify.sh "<message>"  — token/chat from env or ~/.worktui/telegram.env
set -euo pipefail
[ -f "${HOME}/.worktui/telegram.env" ] && . "${HOME}/.worktui/telegram.env"
: "${WORKTUI_TG_TOKEN:?}" "${WORKTUI_TG_CHAT:?}"
curl -fsS "https://api.telegram.org/bot${WORKTUI_TG_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${WORKTUI_TG_CHAT}" \
  --data-urlencode "text=${1:?message required}" >/dev/null
```
Why this over an MCP server:
- **Zero runtime deps** beyond `curl`; no daemon, no `claude_desktop_config.json` entry
  — fits worktui's "thin standalone scripts" ethos.
- **Works even when no Claude session is alive** — essential, since we notify *about*
  child sessions including ones that just died/crashed. The official channel plugin can
  only reply while its host session runs, so it's wrong for "the child finished/crashed."
- **Bot API is the right API** (you only message yourself).

The orchestrator's event layer (see the events design) calls `wt notify` on the
transitions that need a human: `permission` (and the step isn't auto-approvable),
`error`, optionally `done`.

**(B) Inbound remote approval ("approve this permission prompt from my phone").**
This is where the **official Telegram channel plugin** fits: launch the child with
`--channels plugin:telegram@claude-plugins-official` and use the **permission-prompt
relay** to forward prompts to Telegram and approve/deny from an allowlisted sender.
Tradeoffs: research-preview, per-session, gated by plan/org settings, and only while
that session lives.

A lighter DIY alternative (no channel plugin): the orchestrator polls
`getUpdates` for your reply text and maps it to `wt send <claude-pane> "1"` (approve) /
`"2"`/`"3"` — i.e. it types the answer into the child's tmux pane on your behalf. Keeps
everything inside worktui's existing send/read primitives.

**Concrete recommendation:** ship `wt notify` (curl) as the default escalation path
(opt-in by dropping `~/.worktui/telegram.env`). Document the official Telegram *channel*
plugin as the opt-in for interactive remote approval. Only reach for an MTProto MCP
server if you later need the orchestrator to *read* arbitrary Telegram chats.

---

## Sources
- https://github.com/modelcontextprotocol/servers
- https://code.claude.com/docs/en/channels (+ #relay-permission-prompts)
- https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/telegram
- https://github.com/chigwell/telegram-mcp
- https://github.com/chaindead/telegram-mcp
- https://github.com/dryeab/mcp-telegram
- https://github.com/sparfenyuk/mcp-telegram
- https://github.com/harnyk/mcp-telegram-notifier
- https://github.com/guangxiangdebizi/telegram-mcp
- https://core.telegram.org/bots/api#sendmessage
- https://core.telegram.org/bots/faq (rate limits)

### Uncertainty notes
- Star counts / versions are June 2026 snapshots and shift quickly.
- Several smaller servers (`tacticlaunch`, `tensakulabs`, `n24q02m/better-telegram-mcp`,
  `antongsm`, `IQAIcom`, `Muhammad18557`) came from search summaries and were not opened
  individually — treat their API/auth details as indicative, not verified.
- "Channels" is an explicitly labeled **research preview**; the `--channels` flag and
  protocol may change, and availability is gated by plan/org settings.
