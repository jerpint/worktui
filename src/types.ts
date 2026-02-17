export interface Worktree {
  path: string;
  branch: string;
  head: string;
  commitSubject: string;
  commitDate: Date;
  isDirty: boolean;
  isMain: boolean;
  sessionCount: number;
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
  | { kind: "cleanup" };

export interface ResumeTarget {
  sessionId?: string;
  cwd: string;
}
