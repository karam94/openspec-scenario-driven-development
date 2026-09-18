import { defineWorkspace } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineWorkspace([
  {
    test: {
      name: "node",
      environment: "node",
      include: ["src/main/**/*.test.ts", "src/preload/**/*.test.ts", "src/shared/**/*.test.ts"],
    },
  },
  {
    plugins: [react()],
    test: {
      name: "renderer",
      globals: true,
      environment: "jsdom",
      include: ["src/renderer/**/*.test.tsx"],
      setupFiles: ["./vitest.setup.ts"],
    },
  },
]);
