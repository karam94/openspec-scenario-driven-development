const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const core = require("./core");
const { bootstrap, resolveShellPath, loginShellPath } = require("./wiring");

const args = core.defaultArgs();
const windowOpts = {
  preloadPath: path.join(__dirname, "preload.js"),
  indexPath: path.join(__dirname, "index.html"),
  openExternal: (url) => shell.openExternal(url),
};

// bootstrap registers IPC first, resolves the login-shell PATH before the first
// window (so openspec/gh resolve), opens exactly one window, and only then arms
// `activate` — so first-launch activation cannot race startup into a second window.
app.whenReady().then(() =>
  bootstrap({
    app,
    BrowserWindow,
    ipcMain,
    core,
    getArgs: () => args,
    resolvePath: () => resolveShellPath(loginShellPath, process.env),
    windowOpts,
  })
);
