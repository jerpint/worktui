import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { getWorktreeBase } from "./utils.js";

function accessFile(): string {
  return join(getWorktreeBase(), ".accessed.json");
}

export function getAccessTimes(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(accessFile(), "utf-8"));
  } catch {
    return {};
  }
}

export function recordAccess(worktreePath: string): void {
  const times = getAccessTimes();
  times[worktreePath] = Date.now();
  const dir = getWorktreeBase();
  mkdirSync(dir, { recursive: true });
  writeFileSync(accessFile(), JSON.stringify(times, null, 2));
}
