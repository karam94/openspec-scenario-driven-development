import { contextBridge, ipcRenderer } from "electron";
import type { Channel, ElectronAPI } from "../shared/ipc-contract";

// Exactly three named channels — no generic command passthrough. A sandboxed
// preload cannot import wiring.ts at runtime, so the channel strings are
// declared here; typing the map as Record<keyof ElectronAPI, Channel> asserts
// them against the shared contract (a typo or unknown channel fails to compile).
const CHANNELS: Record<keyof ElectronAPI, Channel> = {
  getStatus: "board:getStatus",
  readFile: "board:readFile",
  archive: "board:archive",
};

const api: ElectronAPI = {
  getStatus: () => ipcRenderer.invoke(CHANNELS.getStatus),
  readFile: (filePath) => ipcRenderer.invoke(CHANNELS.readFile, filePath),
  archive: (payload) => ipcRenderer.invoke(CHANNELS.archive, payload),
};

contextBridge.exposeInMainWorld("electronAPI", api);
