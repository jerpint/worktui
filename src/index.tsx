#!/usr/bin/env bun
import { render } from "ink";
import { writeFileSync, unlinkSync } from "fs";
import { runCLI } from "./cli.js";
import { recordAccess } from "./access.js";
import App from "./components/App.js";
import type { LaunchTarget, View } from "./types.js";

const LAUNCH_FILE = "/tmp/worktui-launch";

async function main() {
  const args = process.argv.slice(2);

  // Try CLI subcommands first (list, create, delete, sessions, etc.)
  const handled = await runCLI(args);
  if (handled) return;

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
