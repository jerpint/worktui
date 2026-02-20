#!/usr/bin/env bun
import { render } from "ink";
import { writeFileSync, unlinkSync } from "fs";
import { getGitRoot, createWorktree, createDraftPR } from "./git.js";
import { recordAccess } from "./access.js";
import App from "./components/App.js";
import type { LaunchTarget, View } from "./types.js";

const LAUNCH_FILE = "/tmp/worktui-launch";

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

      // Write launch file so shell wrapper cd's into the worktree
      recordAccess(worktreePath);
      writeFileSync(LAUNCH_FILE, JSON.stringify({ kind: "shell", cwd: worktreePath }));
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

  // Clean up stale launch file before TUI starts
  try { unlinkSync(LAUNCH_FILE); } catch {}

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

  // Write launch instructions to temp file for the shell wrapper
  const target = launchTarget as LaunchTarget | null;
  if (target) {
    recordAccess(target.cwd);
    writeFileSync(LAUNCH_FILE, JSON.stringify(target));
  }
}

main();
