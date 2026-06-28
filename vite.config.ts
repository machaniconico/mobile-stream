import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"]
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
