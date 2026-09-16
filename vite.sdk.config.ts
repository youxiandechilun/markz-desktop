import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    outDir: 'dist-sdk',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        core: resolve(process.cwd(), 'src/core/index.ts'),
        editor: resolve(process.cwd(), 'src/sdk/editor.ts'),
        react: resolve(process.cwd(), 'src/sdk/react.tsx'),
        ai: resolve(process.cwd(), 'src/ai/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', /^@codemirror\//, /^unified/, /^remark-/, /^rehype-/],
    },
  },
})
