const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const core = require("./core");
const {
  registerIpc,
  createWindow,
  wireLifecycle,
  resolveShellPath,
  loginShellPath,
} = require("./wiring");

const args = core.defaultArgs();
const preloadPath = path.join(__dirname, "preload.js");
const indexPath = path.join(__dirname, "index.html");
const createWin = () => createWindow(BrowserWindow, { preloadPath, indexPath });

async function start() {
  // Resolve the real login-shell PATH BEFORE any CLI (openspec/gh) is invoked,
  // so a Finder-launched .app finds them instead of rendering empty.
  await resolveShellPath(loginShellPath, process.env);
  registerIpc(ipcMain, core, () => args);
  createWin();
}

app.whenReady().then(start);
wireLifecycle({ app, BrowserWindow, createWin });
