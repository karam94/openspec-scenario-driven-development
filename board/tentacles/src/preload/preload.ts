import { contextBridge, ipcRenderer } from "electron";
import type { ChannelMap, ElectronAPI } from "../shared/ipc-contract";

// Exactly three named channels — no generic command passthrough. A sandboxed
// preload cannot import wiring.ts at runtime, so the channel strings are
// declared here; typing the map as the shared ChannelMap asserts each method is
// bound to its exact channel (a typo, missing key, or swap fails to compile).
const CHANNELS: ChannelMap = {
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
