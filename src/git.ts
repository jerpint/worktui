import { branchToFolder, getWorktreeBase } from "./utils.js";
import type { Worktree } from "./types.js";
import { getSessionInfo } from "./sessions.js";
import { basename, join, resolve } from "path";
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

/**
 * Tracked-only modifications. Untracked files don't block a branch switch —
 * `git checkout` carries them across, and refuses on its own in the one case
 * that matters (an untracked file that the target branch would clobber).
 */
export async function hasLocalChanges(path: string): Promise<boolean> {
  const [diff, cached] = await Promise.all([
    run(["git", "diff", "--quiet"], path),
    run(["git", "diff", "--cached", "--quiet"], path),
  ]);
  return diff.exitCode !== 0 || cached.exitCode !== 0;
}

/** Any dirt at all, untracked included — the gate for destructive operations. */
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
    raw
      .filter((r) => existsSync(r.path))
      .map(async (r) => {
        const [dirty, commit, sessionInfo] = await Promise.all([
          isDirty(r.path),
          getCommitInfo(r.path, r.head),
          getSessionInfo(r.path),
        ]);
        return {
          path: r.path,
          branch: r.branch,
          head: r.head,
          commitSubject: commit.subject,
          commitDate: commit.date,
          isDirty: dirty,
          isMain: r.isMain,
          sessionCount: sessionInfo.count,
          lastSessionSummary: sessionInfo.lastSummary,
        } satisfies Worktree;
      })
  );

  return worktrees;
}

export async function createWorktree(
  gitRoot: string,
  branch: string,
  startPoint?: string
): Promise<string> {
  const defaultBranch = await getDefaultBranch(gitRoot);

  // The default branch belongs to the primary repo. Giving it a linked worktree
  // locks the primary clone out of it permanently, so redirect there instead.
  if (branch === defaultBranch) {
    const { path } = await restoreDefaultBranch(gitRoot);
    return path;
  }

  // If the primary repo is sitting on the branch we've been asked to break out,
  // git would refuse ("already checked out"). Send the primary home first — that
  // frees the branch and re-parks it here.
  if ((await currentBranch(gitRoot)) === branch) {
    await restoreDefaultBranch(gitRoot);
  }

  const folderName = branchToFolder(branch);
  const worktreesDir = join(getWorktreeBase(), basename(gitRoot));
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
      // New branch — default to origin/main so we don't inherit
      // whatever HEAD the main worktree happens to be on
      if (!startPoint) {
        await run(["git", "fetch", "origin", "main"], gitRoot);
        startPoint = "origin/main";
      }
      const { exitCode, stderr } = await run(
        ["git", "worktree", "add", worktreePath, "-b", branch, startPoint],
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

export interface RemoteBranch {
  name: string;
  author: string;
  date: Date;
}

export async function listRemoteBranches(
  gitRoot: string,
  localBranches: Set<string>
): Promise<RemoteBranch[]> {
  const { stdout } = await run(
    [
      "git", "branch", "-r",
      "--format=%(refname:short)\t%(authorname)\t%(committerdate:iso)",
      "--sort=-committerdate",
    ],
    gitRoot
  );
  return stdout
    .split("\n")
    .filter((line) => line && !line.includes("->"))
    .map((line) => {
      const [ref, author, dateStr] = line.split("\t");
      return {
        name: ref.replace(/^origin\//, ""),
        author: author || "",
        date: dateStr ? new Date(dateStr) : new Date(),
      };
    })
    .filter((b) => !localBranches.has(b.name));
}

export async function getPRUrl(
  cwd: string,
  branch: string
): Promise<string | null> {
  const { stdout, exitCode } = await run(
    ["gh", "pr", "view", branch, "--json", "url", "-q", ".url"],
    cwd
  );
  if (exitCode !== 0) return null;
  return stdout || null;
}

export async function getRepoUrl(cwd: string): Promise<string | null> {
  const { stdout, exitCode } = await run(
    ["gh", "repo", "view", "--json", "url", "-q", ".url"],
    cwd
  );
  if (exitCode !== 0) return null;
  return stdout || null;
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

// --- Default branch ownership -------------------------------------------------
//
// Invariant: the default branch (usually `main`) lives in the primary repo and
// nowhere else. Parking it in a linked worktree under ~/.worktui makes it
// impossible to ever check it out in the primary clone again — git refuses to
// check out a branch that is already checked out somewhere else, and the primary
// gets stranded on whatever branch it happened to be on. Everything below
// enforces and repairs that invariant.

const defaultBranchCache = new Map<string, string>();

export async function getDefaultBranch(gitRoot: string): Promise<string> {
  const cached = defaultBranchCache.get(gitRoot);
  if (cached) return cached;

  let branch = "";

  // origin/HEAD is authoritative when it's set
  const symref = await run(
    ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    gitRoot
  );
  if (symref.exitCode === 0 && symref.stdout) {
    branch = symref.stdout.replace(/^origin\//, "");
  }

  // Fall back to the conventional names — kept local so this never blocks on network
  if (!branch) {
    for (const candidate of ["main", "master"]) {
      const check = await run(
        ["git", "rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`],
        gitRoot
      );
      if (check.exitCode === 0) {
        branch = candidate;
        break;
      }
    }
  }

  branch = branch || "main";
  defaultBranchCache.set(gitRoot, branch);
  return branch;
}

/** Path of the worktree that currently has `branch` checked out, if any. */
export async function findBranchWorktree(
  gitRoot: string,
  branch: string
): Promise<string | null> {
  const { stdout } = await run(
    ["git", "worktree", "list", "--porcelain"],
    gitRoot
  );
  const hit = parsePorcelain(stdout).find((w) => w.branch === branch);
  return hit ? hit.path : null;
}

/** Branch checked out at `path`, or null when detached. */
export async function currentBranch(path: string): Promise<string | null> {
  const { stdout, exitCode } = await run(
    ["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
    path
  );
  return exitCode === 0 && stdout ? stdout : null;
}

export async function untrackedFiles(path: string): Promise<string[]> {
  const { stdout } = await run(
    ["git", "ls-files", "--others", "--exclude-standard"],
    path
  );
  return stdout ? stdout.split("\n").filter(Boolean) : [];
}

export async function pruneWorktrees(gitRoot: string): Promise<void> {
  await run(["git", "worktree", "prune"], gitRoot);
}

export interface RestoreResult {
  /** The primary repo — where the default branch now lives. */
  path: string;
  branch: string;
  /** Human-readable log of what was actually done (empty = nothing needed). */
  actions: string[];
  /** Worktree the displaced branch was moved into, if it had unique commits. */
  parked?: string;
}

/**
 * Put the default branch back in the primary repo.
 *
 * Evicts it from any linked worktree squatting on it, checks it out in the
 * primary, and gives the branch it displaced its own worktree so unmerged work
 * doesn't silently disappear from `wt list`.
 */
export async function restoreDefaultBranch(
  gitRoot: string,
  opts: { force?: boolean } = {}
): Promise<RestoreResult> {
  const def = await getDefaultBranch(gitRoot);
  const actions: string[] = [];

  await pruneWorktrees(gitRoot);

  if ((await currentBranch(gitRoot)) === def) {
    return { path: gitRoot, branch: def, actions };
  }

  // 1. Evict the default branch from whatever linked worktree holds it.
  const holder = await findBranchWorktree(gitRoot, def);
  if (holder && resolve(holder) !== resolve(gitRoot)) {
    if ((await isDirty(holder)) && !opts.force) {
      throw new Error(
        `${def} is checked out at ${holder} and has uncommitted changes.\n` +
          `Commit or stash them there first, or re-run with --force to discard them.`
      );
    }
    const args = ["git", "worktree", "remove", holder];
    if (opts.force) args.push("--force");
    const { exitCode, stderr } = await run(args, gitRoot);
    if (exitCode !== 0) {
      throw new Error(`Failed to release ${def} from ${holder}: ${stderr}`);
    }
    actions.push(`released ${def} from ${holder}`);
  }

  // 2. Move the primary repo onto the default branch.
  const displaced = await currentBranch(gitRoot);
  if ((await hasLocalChanges(gitRoot)) && !opts.force) {
    throw new Error(
      `${gitRoot} has uncommitted changes on ${displaced ?? "a detached HEAD"}.\n` +
        `Commit or stash them first, or re-run with --force to discard them.`
    );
  }
  // Untracked files don't follow a branch switch — git leaves them in place. If
  // any belong to the work we're displacing, they'd silently end up sitting in
  // the default branch's checkout instead of the branch's new worktree.
  const strays = await untrackedFiles(gitRoot);

  const checkout = ["git", "checkout"];
  if (opts.force) checkout.push("--force");
  checkout.push(def);
  const co = await run(checkout, gitRoot);
  if (co.exitCode !== 0) {
    throw new Error(`Failed to check out ${def} in ${gitRoot}: ${co.stderr}`);
  }
  actions.push(`checked out ${def} in ${gitRoot}`);

  // 3. Don't strand the branch we just displaced. If it carries commits that
  //    aren't on the default branch, give it a worktree of its own.
  let parked: string | undefined;
  if (displaced && displaced !== def) {
    const { stdout: ahead } = await run(
      ["git", "rev-list", "--count", `${def}..${displaced}`],
      gitRoot
    );
    if (Number(ahead) > 0) {
      parked = await createWorktree(gitRoot, displaced);
      actions.push(`parked ${displaced} (${ahead} unmerged commit(s)) at ${parked}`);
    }
  }

  if (displaced && displaced !== def && strays.length > 0) {
    const shown = strays.slice(0, 5).join(", ");
    const more = strays.length > 5 ? `, +${strays.length - 5} more` : "";
    actions.push(
      `note: ${strays.length} untracked file(s) stayed behind in ${gitRoot} — ` +
        `git doesn't move them across a branch switch. If they belong to ` +
        `${displaced}, move them${parked ? ` to ${parked}` : ""}: ${shown}${more}`
    );
  }

  return { path: gitRoot, branch: def, actions, parked };
}

export interface LayoutIssue {
  kind: "stale" | "default-branch-displaced" | "primary-off-default";
  message: string;
}

/** Report everything about this repo's worktree layout that violates the invariant. */
export async function diagnoseLayout(gitRoot: string): Promise<LayoutIssue[]> {
  const def = await getDefaultBranch(gitRoot);
  const issues: LayoutIssue[] = [];

  const { stdout } = await run(
    ["git", "worktree", "list", "--porcelain"],
    gitRoot
  );
  for (const w of parsePorcelain(stdout)) {
    if (!existsSync(w.path)) {
      issues.push({
        kind: "stale",
        message: `stale registration: ${w.path}${w.branch ? ` (${w.branch})` : ""}`,
      });
    }
  }

  const holder = await findBranchWorktree(gitRoot, def);
  if (holder && resolve(holder) !== resolve(gitRoot)) {
    issues.push({
      kind: "default-branch-displaced",
      message: `${def} is checked out at ${holder} — it belongs in the primary repo ${gitRoot}`,
    });
  }

  const current = await currentBranch(gitRoot);
  if (current !== def) {
    issues.push({
      kind: "primary-off-default",
      message: `primary repo ${gitRoot} is on ${current ?? "a detached HEAD"}, expected ${def}`,
    });
  }

  return issues;
}
