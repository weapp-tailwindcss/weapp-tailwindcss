import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  shims: true,
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  deps: {
    resolveDepSubpath: true,
  },
  target: ['es2021'],
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.mjs' : '.cjs',
      dts: '.d.ts',
    };
  },
});
