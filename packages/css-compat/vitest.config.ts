import { defineProject } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineProject({
  test: { maxWorkers: workspaceMaxWorkers, globals: true, update: 'none' },
})
