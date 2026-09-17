/*
 * Pure Electron wiring — every function takes the Electron objects it needs as
 * parameters, so the unit tests can drive them with fakes and never import
 * `electron`. main.ts is the thin entry that passes the real Electron in.
 *
 * Electron is imported for TYPES ONLY (`import type`), which erases at compile,
 * so this module has no runtime dependency on electron.
 */

import { execFile } from "node:child_process";
import type { App, BrowserWindow, IpcMain, IpcMainInvokeEvent, WebPreferences } from "electron";
import type { Args } from "./core";
import type { ArchiveArgs, ArchiveResult, ChannelMap, ReadFileResult, StatusResult } from "../shared/ipc-contract";

// IPC channel names. preload.ts hardcodes the same string literals (a sandboxed
// preload cannot import this module); both are typed against the shared
// ChannelMap so the two stay in exact agreement.
export const IPC: ChannelMap = {
  getStatus: "board:getStatus",
  readFile: "board:readFile",
  archive: "board:archive",
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

// The three privileged operations, each backed by core. `getArgs` is a getter
// so the scan args are read fresh per call.
export function makeHandlers(core: BoardCore, getArgs: () => Args) {
  return {
    getStatus: () => core.getStatus(getArgs()),
    readFile: (_event: IpcMainInvokeEvent, filePath: string) => core.readArtifact(getArgs(), filePath),
    archive: (_event: IpcMainInvokeEvent, payload: ArchiveArgs | undefined) => {
      const { repoPath, change } = payload || ({} as Partial<ArchiveArgs>);
      return core.archiveChange(getArgs(), repoPath as string, change as string);
    },
  };
}

export function registerIpc(ipcMain: IpcMain, core: BoardCore, getArgs: () => Args) {
  const handlers = makeHandlers(core, getArgs);
  ipcMain.handle(IPC.getStatus, handlers.getStatus);
  ipcMain.handle(IPC.readFile, handlers.readFile);
  ipcMain.handle(IPC.archive, handlers.archive);
  return handlers;
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

export function createWindow(BrowserWindowCtor: typeof BrowserWindow, { preloadPath, indexPath, openExternal }: WindowOpts): BrowserWindow {
  const win = new BrowserWindowCtor({
    width: 1200,
    height: 860,
    backgroundColor: "#0a0e1a",
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
}: BootstrapDeps) {
  registerIpc(ipcMain, core, getArgs);
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
