#!/usr/bin/env bun
import { render } from "ink";
import { getGitRoot, createWorktree, createDraftPR } from "./git.js";
import App from "./components/App.js";
import type { ResumeTarget, View } from "./types.js";

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

  // TUI mode
  let resumeTarget: ResumeTarget | null = null;

  const instance = render(
    <App
      initialView={initialView}
      onResume={(target) => {
        resumeTarget = target;
        instance.unmount();
      }}
    />
  );

  await instance.waitUntilExit();

  // After TUI exits, resume a Claude session if requested
  const target = resumeTarget as ResumeTarget | null;
  if (target) {
    const proc = Bun.spawn(["claude", "--resume", target.sessionId], {
      cwd: target.cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  }
}

main();
