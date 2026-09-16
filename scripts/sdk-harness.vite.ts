import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({ build: { outDir: 'dist-sdk-test', emptyOutDir: true, lib: { entry: resolve(process.cwd(), 'scripts/sdk-harness.ts'), name: 'MarkzSdkHarness', formats: ['iife'], fileName: () => 'harness.js' }, rollupOptions: { external: [] } } })
