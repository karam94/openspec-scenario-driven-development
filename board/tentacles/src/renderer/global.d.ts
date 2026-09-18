import type { ElectronAPI } from "../shared/ipc-contract";

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

declare module "*.mp3" {
  const src: string;
  export default src;
}

export {};
