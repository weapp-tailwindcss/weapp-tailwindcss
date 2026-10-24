import { diagnosticSymbol } from '../../scripts/diagnostics/constants.mjs'
import { createOperationRecorder } from '../../scripts/diagnostics/operations.mjs'

export const observerKey = Symbol.for(diagnosticSymbol)

export function createObserver() {
  const events = []
  const operations = createOperationRecorder({
    root: '/fixture',
    phase: () => ({ type: 'build-start' }),
    writer: {
      write(name, value) {
        if (name.startsWith('operation-')) {
          events.push(value)
        }
        return {}
      },
    },
  })
  return { operations, events }
}
