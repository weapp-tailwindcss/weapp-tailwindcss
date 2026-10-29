import { defineProject } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineProject({ test: { maxWorkers: workspaceMaxWorkers, name: '@weapp-tailwindcss/source-scan', globals: true } })
