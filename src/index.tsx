#!/usr/bin/env bun
import { render } from "ink";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getGitRoot, createWorktree, createDraftPR } from "./git.js";
import App from "./components/App.js";
import type { LaunchTarget, View } from "./types.js";

const CD_FILE = join(tmpdir(), "claudioscope-cd");

async function main() {
  const args = process.argv.slice(2);

  // CLI mode: worktree -b <branch> [--pr]
  if (args[0] === "-b" && args[1]) {
    const branch = args[1];
    const makePR = args.includes("--pr");

    try {
      const gitRoot = await getGitRoot();
      const worktreePath = await createWorktree(gitRoot, branch);
      console.log(worktreePath);

      if (makePR) {
        const prUrl = await createDraftPR(worktreePath, branch);
        console.log(prUrl);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // Determine initial view
  let initialView: View = { kind: "list" };
  if (args[0] === "cleanup") {
    initialView = { kind: "cleanup" };
  }

  // Clean up stale cd file before TUI starts
  try { unlinkSync(CD_FILE); } catch {}

  // TUI mode
  let launchTarget: LaunchTarget | null = null;

  const instance = render(
    <App
      initialView={initialView}
      onLaunch={(target) => {
        launchTarget = target;
        instance.unmount();
      }}
    />
  );

  await instance.waitUntilExit();

  // After TUI exits, launch the requested target
  const target = launchTarget as LaunchTarget | null;
  if (target) {
    if (target.kind === "claude") {
      const cmd = target.sessionId
        ? ["claude", "--resume", target.sessionId]
        : ["claude"];
      const proc = Bun.spawn(cmd, {
        cwd: target.cwd,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
    } else if (target.kind === "shell") {
      // Write path to temp file for the shell wrapper to cd into
      writeFileSync(CD_FILE, target.cwd);
    }
  }
}

main();
