import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'variants': 'src/variants.ts',
    'preset': 'src/preset.ts',
    'components/index': 'src/components/index.ts',
    'hooks/index': 'src/hooks/index.ts',
    'utils/index': 'src/utils/index.ts',
    'adapters/index': 'src/adapters/index.ts',
  },
  format: ['cjs', 'esm'],
  clean: false,
  dts: true,
  deps: {
    resolveDepSubpath: true,
    neverBundle: [
      '@weapp-tailwindcss/merge',
      '@weapp-tailwindcss/variants',
      '@tarojs/components',
      'react',
      'react/jsx-runtime',
      'tailwind-variants',
      'tailwindcss',
      'tailwindcss/plugin',
    ],
  },
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
      dts: '.d.ts',
    }
  },
})
