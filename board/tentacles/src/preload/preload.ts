import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI } from "../shared/ipc-contract";

// Exactly three named channels — no generic command passthrough. The channel
// strings are hardcoded because a sandboxed preload cannot import wiring.ts at
// runtime; the `ElectronAPI` annotation asserts this surface against the shared
// contract (the type-only import erases at compile).
const api: ElectronAPI = {
  getStatus: () => ipcRenderer.invoke("board:getStatus"),
  readFile: (filePath) => ipcRenderer.invoke("board:readFile", filePath),
  archive: (payload) => ipcRenderer.invoke("board:archive", payload),
};

contextBridge.exposeInMainWorld("electronAPI", api);
