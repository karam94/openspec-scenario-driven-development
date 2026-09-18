import { contextBridge, ipcRenderer } from "electron";
import type { ChannelMap, ElectronAPI, EventChannelMap } from "../shared/ipc-contract";

// A fixed set of named channels — no generic command passthrough. A sandboxed
// preload cannot import wiring.ts at runtime, so the channel strings are
// declared here; typing the map as the shared ChannelMap asserts each method is
// bound to its exact channel (a typo, missing key, or swap fails to compile).
const CHANNELS: ChannelMap = {
  getStatus: "board:getStatus",
  readFile: "board:readFile",
  getDiff: "board:getDiff",
  getFileDiff: "board:getFileDiff",
  archive: "board:archive",
  getSettings: "board:getSettings",
  setSettings: "board:setSettings",
  chooseDirectory: "board:chooseDirectory",
};

// Main → renderer push channels, typed against the shared EventChannelMap for
// the same compile-time agreement as the invoke channels above.
const EVENTS: EventChannelMap = {
  notificationSound: "board:notificationSound",
};

const api: ElectronAPI = {
  getStatus: () => ipcRenderer.invoke(CHANNELS.getStatus),
  readFile: (filePath) => ipcRenderer.invoke(CHANNELS.readFile, filePath),
  getDiff: (repoPath) => ipcRenderer.invoke(CHANNELS.getDiff, repoPath),
  getFileDiff: (repoPath, filePath) => ipcRenderer.invoke(CHANNELS.getFileDiff, repoPath, filePath),
  archive: (payload) => ipcRenderer.invoke(CHANNELS.archive, payload),
  getSettings: () => ipcRenderer.invoke(CHANNELS.getSettings),
  setSettings: (payload) => ipcRenderer.invoke(CHANNELS.setSettings, payload),
  chooseDirectory: () => ipcRenderer.invoke(CHANNELS.chooseDirectory),
  onNotificationSound: (handler) => {
    const listener = () => handler();
    ipcRenderer.on(EVENTS.notificationSound, listener);
    return () => ipcRenderer.removeListener(EVENTS.notificationSound, listener);
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
