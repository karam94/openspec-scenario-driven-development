const { contextBridge, ipcRenderer } = require("electron");

// Exactly three named channels — no generic command passthrough. Channel
// strings must match wiring.js IPC.* (a sandboxed preload cannot require it).
contextBridge.exposeInMainWorld("electronAPI", {
  getStatus: () => ipcRenderer.invoke("board:getStatus"),
  readFile: (filePath) => ipcRenderer.invoke("board:readFile", filePath),
  archive: (payload) => ipcRenderer.invoke("board:archive", payload),
});
