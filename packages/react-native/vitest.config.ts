import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.{test,spec}.ts'],
    testTimeout: 30_000,
    alias: [
      { find: '@weapp-tailwindcss/postcss/native', replacement: path.resolve(__dirname, '../postcss/src/native.ts') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
    benchmark: {
      include: ['benchmark/**/*.{bench,benchmark}.{ts,tsx}'],
    },
  },
})
