import { app, BrowserWindow, ipcMain, Notification, shell } from "electron";
import path from "node:path";
import os from "node:os";
import core from "./core";
import type { Settings } from "./core";
import {
  bootstrap,
  resolveShellPath,
  loginShellPath,
  resolvePathFor,
  makeNotifier,
  makeNativeNotify,
  settingsFilePath,
  readSettingsFile,
  writeSettingsFile,
} from "./wiring";

const args = core.defaultArgs();

// Native completion notifications: the notifier holds last-seen completion state
// across scans and shows a native banner per newly-completed phase / change.
const notifier = makeNotifier(makeNativeNotify(Notification));

// Runs from build/main/ after compile, so preload and the renderer index resolve
// relative to that: build/preload/preload.js and build/renderer/index.html. The
// loadFile-under-file: posture (ADR-0002) is unchanged — still local files.
const windowOpts = {
  preloadPath: path.join(__dirname, "../preload/preload.js"),
  indexPath: path.join(__dirname, "../renderer/index.html"),
  openExternal: (url: string) => shell.openExternal(url),
};

// bootstrap registers IPC first, resolves the login-shell PATH before the first
// window (so openspec/gh resolve), opens exactly one window, and only then arms
// `activate` — so first-launch activation cannot race startup into a second window.
// Under TENTACLES_E2E, PATH resolution is a no-op so an injected stub-bin PATH
// (the e2e harness) survives instead of being overwritten by the login shell's.
const resolvePath = resolvePathFor(process.env, () => resolveShellPath(loginShellPath, process.env));

app.whenReady().then(() => {
  // Resolve the scan root: persisted setting → TENTACLES_ROOT → ~/Code. The root
  // is mutable main state (read fresh per scan via getArgs), so a Settings save
  // re-points scanning without a restart.
  const settingsPath = settingsFilePath(app, process.env);
  args.root = core.resolveRoot(readSettingsFile(settingsPath), process.env, os.homedir());

  const settings = {
    read: () => readSettingsFile(settingsPath),
    write: (s: Settings) => writeSettingsFile(settingsPath, s),
    getRoot: () => args.root,
    setRoot: (root: string) => {
      args.root = root;
    },
    isDir: core.dirExists,
    home: os.homedir(),
  };

  return bootstrap({
    app,
    BrowserWindow,
    ipcMain,
    core,
    getArgs: () => args,
    resolvePath,
    windowOpts,
    observe: notifier.observe,
    settings,
  });
});
