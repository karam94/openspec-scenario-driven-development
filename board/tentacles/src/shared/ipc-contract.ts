// Type-only IPC contract: the single source of truth for the six board
// channels and their payload/result shapes. Everything here is a type, so it
// erases at compile and adds no runtime coupling between the CJS main bundle
// and the Vite renderer bundle.

export type PhaseId = "grill" | "proposal" | "specs" | "design" | "tasks";

export interface Phase {
  id: PhaseId;
  applicable: boolean;
  done: boolean;
  files: string[];
  inProgress?: boolean;
}

export interface Pr {
  url: string;
  state: string;
  reviewDecision: string;
  isDraft: boolean;
}

export type Apply =
  | { source: "tasks.md"; total: number; done: number; file: string | null }
  | { source: "commits"; total: number; done: null; commits: number; file: string | null };

export interface Change {
  change: string;
  repo: string;
  repoPath: string;
  schema: string;
  type: "refactor" | "feature";
  phases: Phase[];
  apply: Apply;
  applyDone: boolean;
  applying: boolean;
  review: "none" | "pending" | "passed";
  planningComplete: boolean;
  complete: boolean;
  pr: Pr | null;
  // Git-derived worktree identity. repositoryId is the shared common-dir (or the
  // worktree path when not a git repo); repositoryName is the display label
  // derived from the repository, not the worktree folder; branch is the branch
  // checked out in this worktree (null when detached or non-git); isPrimary marks
  // the primary checkout within its repository.
  repositoryId: string;
  repositoryName: string;
  branch: string | null;
  isPrimary: boolean;
}

// A Repository row: the worktrees sharing one common-dir. `nested` is true only
// when 2+ worktrees group together, so a lone worktree renders exactly as today.
export interface RepositoryGroup {
  repositoryId: string;
  repositoryName: string;
  nested: boolean;
  worktrees: Change[];
}

export type StatusOk = { generatedAt: string; repoCount: number; changes: Change[] };
export type StatusError = { error: string; changes: [] };
export type StatusResult = StatusOk | StatusError;

export interface ArchiveArgs {
  repoPath: string;
  change: string;
}
export type ArchiveResult = { ok: true } | { ok: false; error: string };
export type ReadFileResult = { ok: true; contents: string } | { ok: false; error: string };

export interface BoardSettings {
  root: string;
  notifications: NotificationSetting;
}
export interface SetSettingsArgs {
  root: string;
  notifications?: NotificationSetting;
}
export type SetSettingsResult =
  | { ok: true; root: string; notifications: NotificationSetting }
  | { ok: false; error: string };

// How completion notifications are surfaced: a full banner with sound, a silent
// banner (sounds muted), or nothing at all (notifications muted).
export type NotificationSetting = "enabled" | "silent" | "muted";

// A native directory-picker result. `path` is the chosen directory, or null when
// the user cancels the dialog (the renderer then leaves the input untouched).
export type ChooseDirectoryResult = { path: string | null };

// Exact method → channel-name mapping: the single source of truth for the
// boundary. Both the preload bridge and the main-process IPC registry are typed
// against it, so a typo, a missing channel, OR a swap (mapping a method to a
// valid-but-wrong channel) all fail to compile.
export interface ChannelMap {
  getStatus: "board:getStatus";
  readFile: "board:readFile";
  archive: "board:archive";
  getSettings: "board:getSettings";
  setSettings: "board:setSettings";
  chooseDirectory: "board:chooseDirectory";
}

export type Channel = ChannelMap[keyof ChannelMap];

// The surface preload exposes on window.electronAPI; declared onto Window in the
// renderer's global.d.ts so components get typed access rather than `any`.
export interface ElectronAPI {
  getStatus(): Promise<StatusResult>;
  readFile(filePath: string): Promise<ReadFileResult>;
  archive(payload: ArchiveArgs): Promise<ArchiveResult>;
  getSettings(): Promise<BoardSettings>;
  setSettings(payload: SetSettingsArgs): Promise<SetSettingsResult>;
  chooseDirectory(): Promise<ChooseDirectoryResult>;
}
