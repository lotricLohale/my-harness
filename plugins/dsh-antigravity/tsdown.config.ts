import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  dts: true,
  clean: true,
  deps: {
    neverBundle: [/^@deepseek-ai\//],
    alwaysBundle: ['pi-antigravity', '@earendil-works/pi-ai'],
  },
})
