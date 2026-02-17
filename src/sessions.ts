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

export async function countSessions(worktreePath: string): Promise<number> {
  const dir = getProjectDir(worktreePath);
  if (!existsSync(dir)) return 0;

  // Fast path: check sessions-index.json
  const indexPath = join(dir, "sessions-index.json");
  if (existsSync(indexPath)) {
    try {
      const data = JSON.parse(await readFile(indexPath, "utf-8"));
      if (Array.isArray(data)) return data.length;
    } catch {}
  }

  // Fallback: count .jsonl files
  try {
    const files = readdirSync(dir);
    return files.filter((f) => f.endsWith(".jsonl")).length;
  } catch {
    return 0;
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
      if (Array.isArray(data)) {
        return data
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
          messageCount = lines.length;

          // Find first user message for prompt
          for (const line of lines.slice(0, 20)) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.role === "user" && typeof parsed.content === "string") {
                firstPrompt = parsed.content.slice(0, 200);
                break;
              }
              if (parsed.role === "user" && Array.isArray(parsed.content)) {
                const textBlock = parsed.content.find(
                  (b: any) => b.type === "text"
                );
                if (textBlock) {
                  firstPrompt = textBlock.text.slice(0, 200);
                  break;
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

    return sessions.sort(
      (a, b) => b.modified.getTime() - a.modified.getTime()
    );
  } catch {
    return [];
  }
}
