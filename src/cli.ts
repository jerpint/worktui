import { writeFileSync } from "fs";
import {
  getGitRoot,
  listWorktrees,
  createWorktree,
  removeWorktree,
  deleteBranch,
  fetchRemote,
  listRemoteBranches,
  createDraftPR,
  getPRUrl,
} from "./git.js";
import { getSessions } from "./sessions.js";
import { listProjects } from "./projects.js";
import { recordAccess, getAccessTimes } from "./access.js";
import { relativeTime, truncate } from "./utils.js";

const LAUNCH_FILE = "/tmp/worktui-launch";

function printHelp() {
  console.log(`worktui — worktree + Claude session manager

Usage:
  wt                              Launch TUI
  wt list [--json]                List worktrees
  wt create <branch> [--pr]       Create worktree (alias: -b)
  wt delete <branch> [--force] [--branch]  Delete worktree
  wt sessions [<branch>]          List Claude sessions for a worktree
  wt projects [--json]            List registered projects
  wt status                       Current worktree info
  wt cleanup [--dry-run]          Remove clean (non-dirty) worktrees
  wt remote [--json]              List remote branches without local worktrees
  wt pr <branch>                  Open or show PR for branch
  wt help                         Show this help`);
}

// --- List ---

async function cmdList(args: string[]) {
  const json = args.includes("--json");
  const gitRoot = await getGitRoot();
  const wts = await listWorktrees(gitRoot);
  const accessTimes = getAccessTimes();
  for (const wt of wts) {
    const ts = accessTimes[wt.path];
    if (ts) wt.lastAccessed = new Date(ts);
  }

  if (json) {
    console.log(JSON.stringify(wts, null, 2));
    return;
  }

  if (wts.length === 0) {
    console.log("No worktrees found.");
    return;
  }

  // Table output
  const maxBranch = Math.max(...wts.map((w) => w.branch.length), 6);
  const branchW = Math.min(maxBranch, 40);

  for (const wt of wts) {
    const branch = truncate(wt.branch || "(detached)", branchW).padEnd(branchW);
    const time = relativeTime(wt.commitDate).padEnd(8);
    const status = wt.isDirty ? "dirty" : "clean";
    const sessions = wt.sessionCount > 0 ? `${wt.sessionCount} session${wt.sessionCount > 1 ? "s" : ""}` : "";
    const main = wt.isMain ? " (main)" : "";
    console.log(`  ${branch}  ${time}  ${status.padEnd(6)}  ${sessions}${main}`);
  }
}

// --- Create ---

async function cmdCreate(args: string[]) {
  const branch = args[0];
  if (!branch) {
    console.error("Usage: wt create <branch> [--pr]");
    process.exit(1);
  }
  const makePR = args.includes("--pr");

  const gitRoot = await getGitRoot();
  const worktreePath = await createWorktree(gitRoot, branch);
  console.log(worktreePath);

  if (makePR) {
    const prUrl = await createDraftPR(worktreePath, branch);
    console.log(prUrl);
  }

  recordAccess(worktreePath);
  writeFileSync(LAUNCH_FILE, JSON.stringify({ kind: "shell", cwd: worktreePath }));
}

// --- Delete ---

async function cmdDelete(args: string[]) {
  const branch = args.find((a) => !a.startsWith("--"));
  if (!branch) {
    console.error("Usage: wt delete <branch> [--force] [--branch]");
    process.exit(1);
  }
  const force = args.includes("--force");
  const alsoBranch = args.includes("--branch");

  const gitRoot = await getGitRoot();
  const wts = await listWorktrees(gitRoot);
  const wt = wts.find((w) => w.branch === branch || w.path.endsWith(`/${branch}`));

  if (!wt) {
    console.error(`Worktree not found: ${branch}`);
    process.exit(1);
  }
  if (wt.isMain) {
    console.error("Cannot delete the main worktree.");
    process.exit(1);
  }

  await removeWorktree(gitRoot, wt.path, force || wt.isDirty);
  console.log(`Removed worktree: ${wt.branch}`);

  if (alsoBranch && wt.branch) {
    try {
      await deleteBranch(gitRoot, wt.branch, true);
      console.log(`Deleted branch: ${wt.branch}`);
    } catch (err: any) {
      console.error(`Failed to delete branch: ${err.message}`);
    }
  }
}

// --- Sessions ---

async function cmdSessions(args: string[]) {
  const json = args.includes("--json");
  const branchArg = args.find((a) => !a.startsWith("--"));

  const gitRoot = await getGitRoot();
  const wts = await listWorktrees(gitRoot);

  let targetPath: string;
  if (branchArg) {
    const wt = wts.find((w) => w.branch === branchArg || w.path.endsWith(`/${branchArg}`));
    if (!wt) {
      console.error(`Worktree not found: ${branchArg}`);
      process.exit(1);
    }
    targetPath = wt.path;
  } else {
    // Use current directory
    targetPath = process.cwd();
  }

  const sessions = await getSessions(targetPath);

  if (json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  if (sessions.length === 0) {
    console.log("No Claude sessions found.");
    return;
  }

  for (const s of sessions) {
    const date = s.modified.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const time = s.modified.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const summary = truncate(s.summary || s.firstPrompt || "(no prompt)", 50);
    const msgs = `${s.messageCount} msgs`;
    console.log(`  ${date} ${time}  ${summary.padEnd(52)}  ${msgs.padStart(8)}  ${s.sessionId.slice(0, 8)}`);
  }
}

// --- Projects ---

async function cmdProjects(args: string[]) {
  const json = args.includes("--json");
  const projects = listProjects();

  if (json) {
    console.log(JSON.stringify(projects, null, 2));
    return;
  }

  if (projects.length === 0) {
    console.log("No projects registered. Run wt from inside a git repo to register one.");
    return;
  }

  for (const p of projects) {
    const wts = `${p.worktreeCount} worktree${p.worktreeCount !== 1 ? "s" : ""}`;
    console.log(`  ${p.name.padEnd(30)}  ${wts}`);
  }
}

// --- Status ---

async function cmdStatus() {
  const cwd = process.cwd();
  let gitRoot: string;
  try {
    gitRoot = await getGitRoot(cwd);
  } catch {
    console.error("Not in a git repository.");
    process.exit(1);
  }

  const wts = await listWorktrees(gitRoot);
  const current = wts.find((wt) => cwd.startsWith(wt.path));

  if (!current) {
    console.log(`Git root: ${gitRoot}`);
    console.log(`Worktrees: ${wts.length}`);
    return;
  }

  const sessions = await getSessions(current.path);
  console.log(`Branch:    ${current.branch}`);
  console.log(`Path:      ${current.path}`);
  console.log(`Status:    ${current.isDirty ? "dirty" : "clean"}`);
  console.log(`Commit:    ${current.head} ${current.commitSubject}`);
  console.log(`Updated:   ${relativeTime(current.commitDate)}`);
  console.log(`Sessions:  ${sessions.length}`);
  if (current.isMain) console.log(`Main:      yes`);
}

// --- Cleanup ---

async function cmdCleanup(args: string[]) {
  const dryRun = args.includes("--dry-run");
  const gitRoot = await getGitRoot();
  const wts = await listWorktrees(gitRoot);
  const clean = wts.filter((w) => !w.isMain && !w.isDirty);

  if (clean.length === 0) {
    console.log("No clean worktrees to remove.");
    return;
  }

  if (dryRun) {
    console.log("Would remove:");
    for (const wt of clean) {
      console.log(`  ${wt.branch} (${wt.path})`);
    }
    return;
  }

  let removed = 0;
  for (const wt of clean) {
    try {
      await removeWorktree(gitRoot, wt.path);
      console.log(`  Removed: ${wt.branch}`);
      removed++;
    } catch (err: any) {
      console.error(`  Failed: ${wt.branch} — ${err.message}`);
    }
  }
  console.log(`\nRemoved ${removed}/${clean.length} worktrees.`);
}

// --- Remote ---

async function cmdRemote(args: string[]) {
  const json = args.includes("--json");
  const gitRoot = await getGitRoot();
  const wts = await listWorktrees(gitRoot);

  await fetchRemote(gitRoot);
  const localBranches = new Set(wts.map((wt) => wt.branch));
  const remote = await listRemoteBranches(gitRoot, localBranches);

  if (json) {
    console.log(JSON.stringify(remote, null, 2));
    return;
  }

  if (remote.length === 0) {
    console.log("No remote-only branches.");
    return;
  }

  for (const b of remote) {
    const time = relativeTime(b.date).padEnd(8);
    console.log(`  ${b.name.padEnd(40)}  ${time}  ${b.author}`);
  }
}

// --- PR ---

async function cmdPR(args: string[]) {
  const branch = args[0];
  if (!branch) {
    console.error("Usage: wt pr <branch>");
    process.exit(1);
  }

  const gitRoot = await getGitRoot();
  const url = await getPRUrl(gitRoot, branch);
  if (url) {
    console.log(url);
  } else {
    console.log(`No PR found for branch: ${branch}`);
  }
}

// --- Router ---

export async function runCLI(args: string[]): Promise<boolean> {
  const cmd = args[0];

  // Commands that should be handled by CLI (not TUI)
  const commands: Record<string, (args: string[]) => Promise<void>> = {
    list: (a) => cmdList(a),
    ls: (a) => cmdList(a),
    create: (a) => cmdCreate(a),
    delete: (a) => cmdDelete(a),
    rm: (a) => cmdDelete(a),
    sessions: (a) => cmdSessions(a),
    projects: (a) => cmdProjects(a),
    status: (a) => cmdStatus(),
    clean: (a) => cmdCleanup(a),
    remote: (a) => cmdRemote(a),
    pr: (a) => cmdPR(a),
    help: async () => { printHelp(); },
    "--help": async () => { printHelp(); },
    "-h": async () => { printHelp(); },
  };

  // -b is an alias for create (backwards compat)
  if (cmd === "-b") {
    try {
      await cmdCreate(args.slice(1));
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    return true;
  }

  if (cmd && cmd in commands && cmd !== "cleanup") {
    try {
      await commands[cmd](args.slice(1));
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    return true;
  }

  // Not a CLI command — let TUI handle it
  return false;
}
