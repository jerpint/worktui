import { readdirSync, statSync } from "fs";
import { join } from "path";
import { getWorktreeBase } from "./utils.js";
import type { Project } from "./types.js";

export function listProjects(): Project[] {
  const base = getWorktreeBase();
  let entries: string[];
  try {
    entries = readdirSync(base);
  } catch {
    return [];
  }

  const projects: Project[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const fullPath = join(base, name);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    // Count subdirectories (worktrees)
    let worktreeCount = 0;
    try {
      for (const child of readdirSync(fullPath)) {
        const childPath = join(fullPath, child);
        try {
          if (statSync(childPath).isDirectory()) worktreeCount++;
        } catch {}
      }
    } catch {}

    projects.push({ name, path: fullPath, worktreeCount });
  }

  // Sort by most recently modified
  projects.sort((a, b) => {
    const aMtime = statSync(a.path).mtimeMs;
    const bMtime = statSync(b.path).mtimeMs;
    return bMtime - aMtime;
  });

  return projects;
}
