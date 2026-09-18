/*
 * Pure Electron wiring — every function takes the Electron objects it needs as
 * parameters, so the unit tests can drive them with fakes and never import
 * `electron`. main.ts is the thin entry that passes the real Electron in.
 *
 * Electron is imported for TYPES ONLY (`import type`), which erases at compile,
 * so this module has no runtime dependency on electron.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { App, BrowserWindow, IpcMain, IpcMainInvokeEvent, Notification, WebPreferences } from "electron";
import { computeNotifications, parseSettings, validateRoot, dirExists, parseNotificationSetting, resolveNotifications } from "./core";
import type { Args, BoardNotification, NotificationSetting, NotifyState, Settings } from "./core";
import type {
  ArchiveArgs,
  ArchiveResult,
  BoardSettings,
  Change,
  ChannelMap,
  ChooseDirectoryResult,
  ReadFileResult,
  SetSettingsArgs,
  SetSettingsResult,
  StatusResult,
} from "../shared/ipc-contract";

// IPC channel names. preload.ts hardcodes the same string literals (a sandboxed
// preload cannot import this module); both are typed against the shared
// ChannelMap so the two stay in exact agreement.
export const IPC: ChannelMap = {
  getStatus: "board:getStatus",
  readFile: "board:readFile",
  archive: "board:archive",
  getSettings: "board:getSettings",
  setSettings: "board:setSettings",
  chooseDirectory: "board:chooseDirectory",
};

// The subset of core the handlers depend on.
export interface BoardCore {
  getStatus(args: Args): Promise<StatusResult>;
  readArtifact(args: Args, filePath: string): ReadFileResult;
  archiveChange(args: Args, repoPath: string, change: string): Promise<ArchiveResult>;
}

export interface WindowOpts {
  preloadPath: string;
  indexPath: string;
  openExternal?: (url: string) => void;
  // When false the window is created hidden (used by the e2e harness so the
  // launched app never pops a window and steals macOS keyboard focus). Defaults
  // to shown for the real app.
  show?: boolean;
}

// The secure renderer posture (ADR-0002): no direct Node in the renderer.
export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

// The scan root is user-settable and persisted to settings.json. `SettingsDeps`
// gives the handlers a way to read/write the file and read/mutate the live scan
// root, injected so the tested handler logic never touches disk directly.
export interface SettingsDeps {
  read: () => Settings;
  write: (settings: Settings) => void;
  getRoot: () => string;
  setRoot: (root: string) => void;
  isDir?: (p: string) => boolean;
  home?: string;
}

// The native directory picker, reduced to a pure result the handler can return:
// the chosen absolute path, or null when the user cancels or selects nothing.
export type ChooseDirectory = () => Promise<string | null>;

// The raw shape Electron's dialog.showOpenDialog resolves to; injected so the
// cancel/empty → null decision is unit-testable without a real dialog. main.ts
// supplies the real one bound to the focused window and openDirectory options.
export type ShowOpenDialog = () => Promise<{ canceled: boolean; filePaths: string[] }>;

export function makeDirectoryChooser(showOpenDialog: ShowOpenDialog): ChooseDirectory {
  return async () => {
    const { canceled, filePaths } = await showOpenDialog();
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0] ?? null;
  };
}

// The privileged operations, each backed by core. `getArgs` is a getter
// so the scan args are read fresh per call. `observe` (optional) is handed each
// scan's changes so completion notifications can fire main-side. `settings`
// (optional) backs the getSettings/setSettings channels.
export function makeHandlers(
  core: BoardCore,
  getArgs: () => Args,
  observe?: (changes: Change[]) => void,
  settings?: SettingsDeps,
  chooseDirectory?: ChooseDirectory
) {
  return {
    getStatus: async () => {
      const result = await core.getStatus(getArgs());
      if (observe && !("error" in result)) observe(result.changes);
      return result;
    },
    readFile: (_event: IpcMainInvokeEvent, filePath: string) => core.readArtifact(getArgs(), filePath),
    archive: (_event: IpcMainInvokeEvent, payload: ArchiveArgs | undefined) => {
      const { repoPath, change } = payload || ({} as Partial<ArchiveArgs>);
      return core.archiveChange(getArgs(), repoPath as string, change as string);
    },
    getSettings: (): BoardSettings => ({
      root: settings ? settings.getRoot() : getArgs().root,
      notifications: settings ? resolveNotifications(settings.read()) : "enabled",
    }),
    setSettings: (_event: IpcMainInvokeEvent, payload: SetSettingsArgs | undefined): SetSettingsResult => {
      if (!settings) return { ok: false, error: "settings unavailable" };
      const res = validateRoot(payload?.root ?? "", settings.isDir ?? dirExists, settings.home);
      if (!res.ok) return res;
      const notifications = parseNotificationSetting(payload?.notifications ?? settings.read().notifications);
      settings.write({ root: res.root, notifications });
      settings.setRoot(res.root);
      return { ok: true, root: res.root, notifications };
    },
    chooseDirectory: async (): Promise<ChooseDirectoryResult> => ({
      path: chooseDirectory ? await chooseDirectory() : null,
    }),
  };
}

export function registerIpc(
  ipcMain: IpcMain,
  core: BoardCore,
  getArgs: () => Args,
  observe?: (changes: Change[]) => void,
  settings?: SettingsDeps,
  chooseDirectory?: ChooseDirectory
) {
  const handlers = makeHandlers(core, getArgs, observe, settings, chooseDirectory);
  ipcMain.handle(IPC.getStatus, handlers.getStatus);
  ipcMain.handle(IPC.readFile, handlers.readFile);
  ipcMain.handle(IPC.archive, handlers.archive);
  ipcMain.handle(IPC.getSettings, handlers.getSettings);
  ipcMain.handle(IPC.setSettings, handlers.setSettings);
  ipcMain.handle(IPC.chooseDirectory, handlers.chooseDirectory);
  return handlers;
}

// settings.json lives under the app's userData, overridable via TENTACLES_SETTINGS
// so the e2e harness can point each run at an isolated temp file.
export function settingsFilePath(app: App, env: NodeJS.ProcessEnv = process.env): string {
  return env.TENTACLES_SETTINGS || path.join(app.getPath("userData"), "settings.json");
}

export function readSettingsFile(filePath: string): Settings {
  try {
    return parseSettings(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

export function writeSettingsFile(filePath: string, settings: Settings): void {
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
}

// Completion-notification glue: holds the last-seen state across scans and shows
// a native notification per decided edge. The decision (computeNotifications) is
// unit-tested in core; the native `show` is the untested boundary. `getSetting`
// (read fresh per scan) gates the presentation: "muted" fires nothing, "silent"
// fires a soundless banner, "enabled" fires with sound. State advances on every
// scan regardless, so muting suppresses firing without replaying missed edges
// once re-enabled.
export type NativeNotify = (n: BoardNotification, opts: { silent: boolean }) => void;

export function makeNotifier(show: NativeNotify, getSetting: () => NotificationSetting = () => "enabled") {
  let state: NotifyState | null = null;
  return {
    observe(changes: Change[]): void {
      const { next, notifications } = computeNotifications(state, changes);
      state = next;
      const setting = getSetting();
      if (setting === "muted") return;
      const silent = setting === "silent";
      for (const n of notifications) show(n, { silent });
    },
  };
}

// Builds the native show from Electron's Notification constructor. main.ts passes
// the real one; this is the only place a native OS banner is created.
export function makeNativeNotify(NotificationCtor: typeof Notification): NativeNotify {
  return (n, opts) => {
    new NotificationCtor({ title: n.title, body: n.body, silent: opts.silent }).show();
  };
}

// External links (the board's PR link uses target="_blank") must open in the
// system browser, never as an in-app Electron child window. Returns a
// setWindowOpenHandler callback that opens allowed https URLs externally and
// always denies creating a child BrowserWindow.
export function makeWindowOpenHandler(
  openExternal: ((url: string) => void) | undefined,
  isAllowed: (u: unknown) => boolean = (u) => /^https:\/\//i.test(String(u))
) {
  return ({ url }: { url: string }): { action: "deny" } => {
    if (isAllowed(url) && typeof openExternal === "function") openExternal(url);
    return { action: "deny" };
  };
}

export function createWindow(BrowserWindowCtor: typeof BrowserWindow, { preloadPath, indexPath, openExternal, show }: WindowOpts): BrowserWindow {
  const win = new BrowserWindowCtor({
    width: 1200,
    height: 860,
    backgroundColor: "#0a0e1a",
    show: show !== false,
    webPreferences: secureWebPreferences(preloadPath),
  });
  if (win.webContents && typeof win.webContents.setWindowOpenHandler === "function") {
    win.webContents.setWindowOpenHandler(makeWindowOpenHandler(openExternal));
  }
  win.loadFile(indexPath);
  return win;
}

// A single-window manager: ensure() creates the window only when none is open,
// so repeated calls never open a second one.
export function makeWindowManager(BrowserWindowCtor: typeof BrowserWindow, opts: WindowOpts) {
  return {
    ensure(): BrowserWindow {
      const open = BrowserWindowCtor.getAllWindows ? BrowserWindowCtor.getAllWindows() : [];
      if (open.length > 0) return open[0] as BrowserWindow;
      return createWindow(BrowserWindowCtor, opts);
    },
  };
}

export interface BootstrapDeps {
  app: App;
  BrowserWindow: typeof BrowserWindow;
  ipcMain: IpcMain;
  core: BoardCore;
  getArgs: () => Args;
  resolvePath: () => Promise<unknown>;
  windowOpts: WindowOpts;
  platform?: NodeJS.Platform;
  observe?: (changes: Change[]) => void;
  settings?: SettingsDeps;
  chooseDirectory?: ChooseDirectory;
}

// Ordered startup coordinator. Registers IPC handlers BEFORE any window can call
// a channel, resolves the login-shell PATH BEFORE the first window opens (so its
// first getStatus sees the real PATH), then opens exactly one window. `activate`
// is ignored until startup completes and is idempotent thereafter.
export async function bootstrap({
  app,
  BrowserWindow: BrowserWindowCtor,
  ipcMain,
  core,
  getArgs,
  resolvePath,
  windowOpts,
  platform = process.platform,
  observe,
  settings,
  chooseDirectory,
}: BootstrapDeps) {
  registerIpc(ipcMain, core, getArgs, observe, settings, chooseDirectory);
  const windows = makeWindowManager(BrowserWindowCtor, windowOpts);
  let started = false;

  app.on("window-all-closed", () => {
    if (platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (started) windows.ensure();
  });

  await resolvePath();
  windows.ensure();
  started = true;
  return windows;
}

type ShellEnvResult = string | { PATH?: string } | null | undefined;

// Merge a resolved login-shell PATH into `env` so CLIs resolve. Returns the
// applied PATH. `shellEnvFn` is injected (faked in tests); loginShellPath is the
// real resolver used by main.ts.
export async function resolveShellPath(
  shellEnvFn: () => Promise<ShellEnvResult>,
  env: NodeJS.ProcessEnv = process.env
): Promise<string | undefined> {
  const resolved = await shellEnvFn();
  const p = typeof resolved === "string" ? resolved : resolved && resolved.PATH;
  if (p) env.PATH = p;
  return env.PATH;
}

// Selects the startup PATH resolver: under TENTACLES_E2E a no-op (so an injected
// PATH survives for the e2e harness), otherwise the real resolver. Pure so both
// branches are observable in a unit test and a reversed flag cannot slip through.
export function resolvePathFor(
  env: NodeJS.ProcessEnv,
  realResolver: () => Promise<unknown>
): () => Promise<unknown> {
  return env.TENTACLES_E2E ? () => Promise.resolve() : realResolver;
}

// Real resolver: ask the user's login shell for its PATH (macOS GUI apps get a
// minimal PATH). Best-effort — returns null on failure, leaving PATH unchanged.
export function loginShellPath(): Promise<string | null> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/zsh";
    execFile(shell, ["-ilc", 'printf %s "$PATH"'], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      resolve(String(stdout).trim());
    });
  });
}
