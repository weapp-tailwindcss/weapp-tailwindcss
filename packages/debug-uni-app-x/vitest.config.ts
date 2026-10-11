import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    include: ['test/**/*.{test,spec}.ts'],
  },
})
