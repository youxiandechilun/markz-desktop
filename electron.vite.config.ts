import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(process.cwd(), "electron/main.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(process.cwd(), "electron/preload.ts"),
        output: { format: "cjs", entryFileNames: "preload.cjs" }
      }
    }
  },
  renderer: {
    root: resolve(process.cwd(), "src/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        // The package's browser export uses document.createElement; workers need the pure JS decoder.
        "decode-named-character-reference": resolve(process.cwd(), "node_modules/decode-named-character-reference/index.js"),
        "@": resolve(process.cwd(), "src")
      }
    },
    build: {
      minify: 'esbuild',
      rollupOptions: {
        input: resolve(process.cwd(), "src/renderer/index.html")
      }
    }
  }
});
