/*
 * Pure Electron wiring — every function takes the Electron objects it needs as
 * parameters, so the unit tests can drive them with fakes and never import
 * `electron`. main.js is the thin entry that passes the real Electron in.
 */

const { execFile } = require("node:child_process");

// IPC channel names. preload.js hardcodes the same string literals (a sandboxed
// preload cannot require this module); keep them in sync.
const IPC = {
  getStatus: "board:getStatus",
  readFile: "board:readFile",
  archive: "board:archive",
};

// The secure renderer posture (ADR-0002): no direct Node in the renderer.
function secureWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

// The three privileged operations, each backed by core.js. `getArgs` is a
// getter so the scan args are read fresh per call.
function makeHandlers(core, getArgs) {
  return {
    getStatus: () => core.getStatus(getArgs()),
    readFile: (_event, filePath) => core.readArtifact(getArgs(), filePath),
    archive: (_event, payload) => {
      const { repoPath, change } = payload || {};
      return core.archiveChange(getArgs(), repoPath, change);
    },
  };
}

function registerIpc(ipcMain, core, getArgs) {
  const handlers = makeHandlers(core, getArgs);
  ipcMain.handle(IPC.getStatus, handlers.getStatus);
  ipcMain.handle(IPC.readFile, handlers.readFile);
  ipcMain.handle(IPC.archive, handlers.archive);
  return handlers;
}

function createWindow(BrowserWindow, { preloadPath, indexPath }) {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    backgroundColor: "#0a0e1a",
    webPreferences: secureWebPreferences(preloadPath),
  });
  win.loadFile(indexPath);
  return win;
}

// A single-window manager: ensure() creates the window only when none is open,
// so repeated calls never open a second one.
function makeWindowManager(BrowserWindow, opts) {
  return {
    ensure() {
      const open = BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
      if (open.length > 0) return open[0];
      return createWindow(BrowserWindow, opts);
    },
  };
}

// Ordered startup coordinator. Registers IPC handlers BEFORE any window can call
// a channel, resolves the login-shell PATH BEFORE the first window opens (so its
// first getStatus sees the real PATH), then opens exactly one window. `activate`
// is ignored until startup completes and is idempotent thereafter, so a
// first-launch `activate` firing during PATH resolution cannot open a premature
// or duplicate window.
async function bootstrap({ app, BrowserWindow, ipcMain, core, getArgs, resolvePath, windowOpts, platform = process.platform }) {
  registerIpc(ipcMain, core, getArgs);
  const windows = makeWindowManager(BrowserWindow, windowOpts);
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

// Merge a resolved login-shell PATH into `env` so CLIs resolve. Returns the
// applied PATH. `shellEnvFn` is injected (faked in tests); loginShellPath is the
// real resolver used by main.js.
async function resolveShellPath(shellEnvFn, env = process.env) {
  const resolved = await shellEnvFn();
  const p = typeof resolved === "string" ? resolved : resolved && resolved.PATH;
  if (p) env.PATH = p;
  return env.PATH;
}

// Real resolver: ask the user's login shell for its PATH (macOS GUI apps get a
// minimal PATH). Best-effort — returns null on failure, leaving PATH unchanged.
function loginShellPath() {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/zsh";
    execFile(shell, ["-ilc", 'printf %s "$PATH"'], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      resolve(String(stdout).trim());
    });
  });
}

module.exports = {
  IPC,
  secureWebPreferences,
  makeHandlers,
  registerIpc,
  createWindow,
  makeWindowManager,
  bootstrap,
  resolveShellPath,
  loginShellPath,
};
