import { branchToFolder } from "./utils.js";
import type { Worktree } from "./types.js";
import { countSessions } from "./sessions.js";
import { join, resolve } from "path";
import { existsSync, copyFileSync, mkdirSync } from "fs";

async function run(
  cmd: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export async function getGitRoot(cwd?: string): Promise<string> {
  // Use --git-common-dir to always resolve to the main repo,
  // even when called from inside a worktree.
  const { stdout: commonDir, exitCode } = await run(
    ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
    cwd
  );
  if (exitCode !== 0) throw new Error("Not a git repository");
  // commonDir is e.g. /Users/x/repo/.git — parent is the repo root
  return resolve(commonDir, "..");
}

export async function isDirty(path: string): Promise<boolean> {
  const [diff, cached, untracked] = await Promise.all([
    run(["git", "diff", "--quiet"], path),
    run(["git", "diff", "--cached", "--quiet"], path),
    run(
      ["git", "ls-files", "--others", "--exclude-standard"],
      path
    ),
  ]);
  return (
    diff.exitCode !== 0 ||
    cached.exitCode !== 0 ||
    untracked.stdout.length > 0
  );
}

interface RawWorktree {
  path: string;
  head: string;
  branch: string;
  isMain: boolean;
}

function parsePorcelain(output: string): RawWorktree[] {
  const worktrees: RawWorktree[] = [];
  const blocks = output.split("\n\n").filter((b) => b.trim());
  let isFirst = true;

  for (const block of blocks) {
    const lines = block.split("\n");
    let path = "";
    let head = "";
    let branch = "";

    for (const line of lines) {
      if (line.startsWith("worktree ")) path = line.slice(9);
      else if (line.startsWith("HEAD ")) head = line.slice(5, 12);
      else if (line.startsWith("branch refs/heads/"))
        branch = line.slice(18);
    }

    if (path) {
      worktrees.push({ path, head, branch, isMain: isFirst });
      isFirst = false;
    }
  }

  return worktrees;
}

async function getCommitInfo(
  path: string,
  head: string
): Promise<{ subject: string; date: Date }> {
  const { stdout } = await run(
    ["git", "log", "-1", "--format=%s%n%aI", head],
    path
  );
  const lines = stdout.split("\n");
  return {
    subject: lines[0] || "",
    date: lines[1] ? new Date(lines[1]) : new Date(),
  };
}

export async function listWorktrees(gitRoot: string): Promise<Worktree[]> {
  const { stdout } = await run(["git", "worktree", "list", "--porcelain"], gitRoot);
  const raw = parsePorcelain(stdout);

  const worktrees = await Promise.all(
    raw.map(async (r) => {
      const [dirty, commit, sessions] = await Promise.all([
        isDirty(r.path),
        getCommitInfo(r.path, r.head),
        countSessions(r.path),
      ]);
      return {
        path: r.path,
        branch: r.branch,
        head: r.head,
        commitSubject: commit.subject,
        commitDate: commit.date,
        isDirty: dirty,
        isMain: r.isMain,
        sessionCount: sessions,
      } satisfies Worktree;
    })
  );

  return worktrees;
}

export async function createWorktree(
  gitRoot: string,
  branch: string
): Promise<string> {
  const folderName = branchToFolder(branch);
  const worktreesDir = resolve(gitRoot, "..", "worktrees");
  const worktreePath = join(worktreesDir, folderName);

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    return worktreePath;
  }

  // Ensure worktrees directory exists
  mkdirSync(worktreesDir, { recursive: true });

  // Check if branch exists locally
  const localCheck = await run(
    ["git", "rev-parse", "--verify", branch],
    gitRoot
  );

  if (localCheck.exitCode === 0) {
    // Local branch exists
    const { exitCode, stderr } = await run(
      ["git", "worktree", "add", worktreePath, branch],
      gitRoot
    );
    if (exitCode !== 0) throw new Error(`Failed to create worktree: ${stderr}`);
  } else {
    // Check if remote branch exists
    const remoteCheck = await run(
      ["git", "rev-parse", "--verify", `origin/${branch}`],
      gitRoot
    );

    if (remoteCheck.exitCode === 0) {
      // Remote branch exists
      const { exitCode, stderr } = await run(
        ["git", "worktree", "add", worktreePath, "-b", branch, `origin/${branch}`],
        gitRoot
      );
      if (exitCode !== 0)
        throw new Error(`Failed to create worktree: ${stderr}`);
    } else {
      // New branch
      const { exitCode, stderr } = await run(
        ["git", "worktree", "add", worktreePath, "-b", branch],
        gitRoot
      );
      if (exitCode !== 0)
        throw new Error(`Failed to create worktree: ${stderr}`);
    }
  }

  // Copy .claude/settings.local.json if it exists
  const settingsSrc = join(gitRoot, ".claude", "settings.local.json");
  if (existsSync(settingsSrc)) {
    const settingsDest = join(worktreePath, ".claude");
    mkdirSync(settingsDest, { recursive: true });
    copyFileSync(settingsSrc, join(settingsDest, "settings.local.json"));
  }

  return worktreePath;
}

export async function removeWorktree(
  gitRoot: string,
  path: string,
  force: boolean = false
): Promise<void> {
  const args = ["git", "worktree", "remove", path];
  if (force) args.splice(3, 0, "--force");
  const { exitCode, stderr } = await run(args, gitRoot);
  if (exitCode !== 0) throw new Error(`Failed to remove worktree: ${stderr}`);
}

export async function deleteBranch(
  gitRoot: string,
  branch: string,
  force: boolean = false
): Promise<void> {
  const flag = force ? "-D" : "-d";
  const { exitCode, stderr } = await run(
    ["git", "branch", flag, branch],
    gitRoot
  );
  if (exitCode !== 0) throw new Error(`Failed to delete branch: ${stderr}`);
}

export async function fetchRemote(gitRoot: string): Promise<void> {
  const { exitCode, stderr } = await run(["git", "fetch", "--prune"], gitRoot);
  if (exitCode !== 0) throw new Error(`Failed to fetch: ${stderr}`);
}

export async function listRemoteBranches(
  gitRoot: string,
  localBranches: Set<string>
): Promise<string[]> {
  const { stdout } = await run(
    ["git", "branch", "-r", "--format=%(refname:short)"],
    gitRoot
  );
  return stdout
    .split("\n")
    .filter((b) => b && !b.includes("->")) // skip HEAD -> origin/main
    .map((b) => b.replace(/^origin\//, ""))
    .filter((b) => !localBranches.has(b));
}

export async function createDraftPR(
  cwd: string,
  branch: string
): Promise<string> {
  // Push branch to remote
  await run(["git", "push", "-u", "origin", branch], cwd);
  // Create draft PR
  const { stdout, exitCode, stderr } = await run(
    ["gh", "pr", "create", "--draft", "--fill"],
    cwd
  );
  if (exitCode !== 0) throw new Error(`Failed to create PR: ${stderr}`);
  return stdout;
}
