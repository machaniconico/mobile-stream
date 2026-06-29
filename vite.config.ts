import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react") || id.includes("/node_modules/react-dom")) {
            return "react";
          }
          if (id.includes("/src/domain/vrmRuntime")) {
            return "vrm-runtime";
          }
          return undefined;
        }
      }
    }
  },
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    testTimeout: 15_000
  }
});
