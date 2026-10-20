import { defineConfig } from 'vitest/config'
import base from '../../vitest.e2e.config'

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['e2e/tailwind-capabilities/build-matrix/run.test.ts'],
  },
})
