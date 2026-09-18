import { app, BrowserWindow, ipcMain, Notification, shell, dialog } from "electron";
import type { OpenDialogOptions } from "electron";
import path from "node:path";
import os from "node:os";
import core from "./core";
import type { Settings } from "./core";
import type { EventChannelMap } from "../shared/ipc-contract";
import {
  bootstrap,
  resolveShellPath,
  loginShellPath,
  resolvePathFor,
  makeNotifier,
  makeNativeNotify,
  makeDirectoryChooser,
  settingsFilePath,
  readSettingsFile,
  writeSettingsFile,
} from "./wiring";

const args = core.defaultArgs();

// Main → renderer push channels, typed against the shared map (mirrors preload).
const EVENTS: EventChannelMap = {
  notificationSound: "board:notificationSound",
};

// Runs from build/main/ after compile, so preload and the renderer index resolve
// relative to that: build/preload/preload.js and build/renderer/index.html. The
// loadFile-under-file: posture (ADR-0002) is unchanged — still local files.
const windowOpts = {
  preloadPath: path.join(__dirname, "../preload/preload.js"),
  indexPath: path.join(__dirname, "../renderer/index.html"),
  openExternal: (url: string) => shell.openExternal(url),
  // Under the e2e harness (TENTACLES_E2E) launch the window hidden so the app
  // never pops a window that steals macOS keyboard focus mid-run.
  show: !process.env.TENTACLES_E2E,
};

// bootstrap registers IPC first, resolves the login-shell PATH before the first
// window (so openspec/gh resolve), opens exactly one window, and only then arms
// `activate` — so first-launch activation cannot race startup into a second window.
// Under TENTACLES_E2E, PATH resolution is a no-op so an injected stub-bin PATH
// (the e2e harness) survives instead of being overwritten by the login shell's.
const resolvePath = resolvePathFor(process.env, () => resolveShellPath(loginShellPath, process.env));

app.whenReady().then(() => {
  // Under the e2e harness, run as a macOS "accessory" app: no Dock icon and,
  // crucially, the app never becomes the active/foreground app, so launching it
  // for a test does not steal keyboard focus from whatever the user is typing in.
  if (process.env.TENTACLES_E2E && process.platform === "darwin" && typeof app.setActivationPolicy === "function") {
    app.setActivationPolicy("accessory");
  }

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

  // Native "Browse…" directory picker for the scan-root setting. Presented as a
  // sheet on the focused window when one is open; the openDirectory property
  // restricts the dialog to choosing a single existing directory.
  const chooseDirectory = makeDirectoryChooser(() => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options: OpenDialogOptions = {
      title: "Select scan root directory",
      properties: ["openDirectory", "createDirectory"],
    };
    return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
  });

  // Native completion notifications: the notifier holds last-seen completion
  // state across scans and shows a native banner per newly-completed phase /
  // change, gated on the persisted preference (read fresh per scan so a Settings
  // save takes effect without a restart).
  const notifier = makeNotifier(
    makeNativeNotify(Notification, () => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send(EVENTS.notificationSound);
    }),
    () => core.resolveNotifications(settings.read())
  );

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
    chooseDirectory,
    openPath: (target: string) => shell.openPath(target),
  });
});
