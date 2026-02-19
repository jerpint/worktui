import type { ClaudeSession } from "./types.js";
import { encodePath } from "./utils.js";
import { join } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";

const CLAUDE_DIR = join(process.env.HOME || "~", ".claude", "projects");

function getProjectDir(worktreePath: string): string {
  const encoded = encodePath(worktreePath);
  return join(CLAUDE_DIR, encoded);
}

function parseIndex(data: any): any[] | null {
  // Format: { version: 1, entries: [...] }
  if (data && Array.isArray(data.entries)) return data.entries;
  // Legacy: plain array
  if (Array.isArray(data)) return data;
  return null;
}

export interface SessionInfo {
  count: number;
  lastSummary: string;
}

export async function getSessionInfo(worktreePath: string): Promise<SessionInfo> {
  const dir = getProjectDir(worktreePath);
  if (!existsSync(dir)) return { count: 0, lastSummary: "" };

  // Fast path: check sessions-index.json
  const indexPath = join(dir, "sessions-index.json");
  if (existsSync(indexPath)) {
    try {
      const data = JSON.parse(await readFile(indexPath, "utf-8"));
      const entries = parseIndex(data);
      if (entries) {
        const valid = entries
          .filter((e: any) => e.messageCount > 0)
          .sort((a: any, b: any) =>
            new Date(b.modified || 0).getTime() - new Date(a.modified || 0).getTime()
          );
        return {
          count: valid.length,
          lastSummary: valid[0]?.summary || valid[0]?.firstPrompt || "",
        };
      }
    } catch {}
  }

  // Fallback: read .jsonl files
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    if (files.length === 0) return { count: 0, lastSummary: "" };

    // Find the most recently modified file
    let newest = files[0];
    let newestMtime = 0;
    for (const f of files) {
      const mtime = statSync(join(dir, f)).mtimeMs;
      if (mtime > newestMtime) {
        newestMtime = mtime;
        newest = f;
      }
    }

    // Extract first user prompt from newest session
    let lastSummary = "";
    try {
      const content = await readFile(join(dir, newest), "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "user" && parsed.message) {
            const msg = parsed.message;
            if (typeof msg.content === "string") {
              lastSummary = msg.content.slice(0, 200);
            } else if (Array.isArray(msg.content)) {
              const textBlock = msg.content.find((b: any) => b.type === "text");
              if (textBlock) lastSummary = textBlock.text.slice(0, 200);
            }
            break;
          }
        } catch {}
      }
    } catch {}

    return { count: files.length, lastSummary };
  } catch {
    return { count: 0, lastSummary: "" };
  }
}

export async function getSessions(
  worktreePath: string
): Promise<ClaudeSession[]> {
  const dir = getProjectDir(worktreePath);
  if (!existsSync(dir)) return [];

  // Try sessions-index.json first
  const indexPath = join(dir, "sessions-index.json");
  if (existsSync(indexPath)) {
    try {
      const data = JSON.parse(await readFile(indexPath, "utf-8"));
      const entries = parseIndex(data);
      if (entries) {
        return entries
          .filter((entry: any) => entry.messageCount > 0)
          .map((entry: any) => ({
            sessionId: entry.sessionId || "",
            firstPrompt: entry.firstPrompt || "",
            summary: entry.summary || "",
            messageCount: entry.messageCount || 0,
            created: new Date(entry.created || 0),
            modified: new Date(entry.modified || 0),
            gitBranch: entry.gitBranch || "",
          }))
          .sort(
            (a: ClaudeSession, b: ClaudeSession) =>
              b.modified.getTime() - a.modified.getTime()
          );
      }
    } catch {}
  }

  // Fallback: read .jsonl files for metadata
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    const sessions = await Promise.all(
      files.map(async (file) => {
        const filePath = join(dir, file);
        const sessionId = file.replace(".jsonl", "");
        const stat = statSync(filePath);

        let firstPrompt = "";
        let messageCount = 0;

        try {
          const content = await readFile(filePath, "utf-8");
          const lines = content.split("\n").filter((l) => l.trim());

          // Only count user/assistant messages, not file-history-snapshot etc.
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === "user" || parsed.type === "assistant") {
                messageCount++;
              }
              // Find first user message for prompt
              if (!firstPrompt && parsed.type === "user" && parsed.message) {
                const msg = parsed.message;
                if (typeof msg.content === "string") {
                  firstPrompt = msg.content.slice(0, 200);
                } else if (Array.isArray(msg.content)) {
                  const textBlock = msg.content.find(
                    (b: any) => b.type === "text"
                  );
                  if (textBlock) {
                    firstPrompt = textBlock.text.slice(0, 200);
                  }
                }
              }
            } catch {}
          }
        } catch {}

        return {
          sessionId,
          firstPrompt,
          summary: firstPrompt,
          messageCount,
          created: stat.birthtime,
          modified: stat.mtime,
          gitBranch: "",
        } satisfies ClaudeSession;
      })
    );

    return sessions
      .filter((s) => s.messageCount > 0)
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());
  } catch {
    return [];
  }
}
