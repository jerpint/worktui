export interface Worktree {
  path: string;
  branch: string;
  head: string;
  commitSubject: string;
  commitDate: Date;
  isDirty: boolean;
  isMain: boolean;
  sessionCount: number;
  lastSessionSummary: string;
  lastAccessed?: Date;
}

export interface ClaudeSession {
  sessionId: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: Date;
  modified: Date;
  gitBranch: string;
}

export type View =
  | { kind: "list" }
  | { kind: "detail"; worktree: Worktree }
  | { kind: "create" }
  | { kind: "delete"; worktree: Worktree }
  | { kind: "cleanup" }
  | { kind: "fetch" };

export type LaunchTarget =
  | { kind: "claude"; cwd: string; sessionId?: string }
  | { kind: "shell"; cwd: string };
