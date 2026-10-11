import process from 'node:process'
import { runScenario } from '../src/runner.mjs'
import { createScenarios } from '../src/scenarios.mjs'

process.once('message', async ({ config, id, warmups, runs }) => {
  try {
    const testCase = createScenarios(config).find(item => item.id === id)
    if (!testCase) {
      throw new Error(`未知性能场景: ${id}`)
    }
    const result = await runScenario(testCase, warmups, runs)
    process.send({ ...result, processId: process.pid }, () => process.exit(0))
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exit(1)
  }
})
