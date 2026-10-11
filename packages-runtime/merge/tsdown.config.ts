import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/slim.ts', 'src/lite.ts'],
    format: ['cjs', 'esm'],
    clean: true,
    dts: true,
    deps: {
      resolveDepSubpath: true,
    },
    target: 'node18',
    failOnWarn: false,
  },
])
