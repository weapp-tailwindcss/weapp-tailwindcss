import fs from 'node:fs/promises'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { PROCESS_OBSERVER_HOST_STARTUP_MS, PROCESS_OBSERVER_PREPARE_MS } from '../../scripts/demo-e2e-workflow/process-observer/transport'
import { createOutputIntegrityMonitor } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/output-integrity'
import { createWatchSession } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { readFileIfExists, waitFor, writeFilePreserveEol } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import {
  createRootStyleImportShellHmrCases,
  selectRootStyleImportShellHmrCases,
} from '../rootStyleImportShellHmr'

const ROOT_STYLE_HMR_TIMEOUT_MS = 180_000
const ROOT_STYLE_HMR_TEST_TIMEOUT_MS = ROOT_STYLE_HMR_TIMEOUT_MS + PROCESS_OBSERVER_HOST_STARTUP_MS + PROCESS_OBSERVER_PREPARE_MS + 15_000
const PURE_LOCAL_IMPORT_RE = /^@import (['"])(\.[^'"]+)\1;$/
const safeIconSelector = '.i-_bmdi--github-circle_B'
const unsafeSelectorFragments = ['.i-\\[', '.before\\:']

function mutateAppSource(source: string, probeClass: string) {
  if (source.includes('</script>')) {
    return source.replace(
      '</script>',
      `const rootStyleImportShellHmrProbe = '${probeClass}'\n</script>`,
    )
  }
  if (source.includes('</template>')) {
    return source.replace(
      '</template>',
      `  <view hidden class="${probeClass}">root-style-import-shell-hmr</view>\n</template>`,
    )
  }
  throw new Error('Mutation source is missing a script or template closing tag')
}

async function inspectRootStyle(rootStyleFile: string) {
  const rootStyle = await readFileIfExists(rootStyleFile)
  const match = rootStyle?.trim().match(PURE_LOCAL_IMPORT_RE)
  if (!rootStyle || !match) {
    return undefined
  }

  const importRequest = match[2]
  const generatedStyleFile = path.resolve(path.dirname(rootStyleFile), importRequest)
  const generatedStyle = await readFileIfExists(generatedStyleFile)
  if (!generatedStyle) {
    return undefined
  }

  return {
    rootStyle,
    importRequest,
    generatedStyle,
    generatedStyleFile,
  }
}

const enabled = process.env.E2E_ROOT_STYLE_SHELL_HMR === '1'
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const cases = selectRootStyleImportShellHmrCases(
  createRootStyleImportShellHmrCases(repositoryRoot),
  process.env.E2E_ROOT_STYLE_SHELL_CASE,
)

if (enabled && cases.length === 0) {
  throw new Error(`No root style import shell HMR cases matched: ${process.env.E2E_ROOT_STYLE_SHELL_CASE ?? ''}`)
}

describe.skipIf(!enabled)('root style pure import shell HMR', () => {
  it.each(cases)('$name keeps the root wrapper and replays generated CSS', async (testCase) => {
    const originalSource = await fs.readFile(testCase.sourceFile, 'utf8')
    const updatedSource = mutateAppSource(originalSource, testCase.probeClass)
    const session = await createWatchSession(testCase.projectRoot, testCase.devScript, { quietSass: true })
    const sessionStartedAt = session.startedAt ?? Date.now()
    let initialRootStyle = ''
    let initialImportRequest = ''
    let generatedStyleFile = ''
    let outputIntegrityMonitor: ReturnType<typeof createOutputIntegrityMonitor>

    try {
      await waitFor(
        async () => {
          const output = await inspectRootStyle(testCase.rootStyleFile)
          if (session.lastCompileSuccessAt() <= sessionStartedAt || !output?.generatedStyle.includes('--tw-')) {
            return false
          }
          initialRootStyle = output.rootStyle
          initialImportRequest = output.importRequest
          generatedStyleFile = output.generatedStyleFile
          return output.generatedStyle.includes(safeIconSelector)
            && !output.generatedStyle.includes(testCase.probeValue)
        },
        {
          timeoutMs: ROOT_STYLE_HMR_TIMEOUT_MS,
          pollMs: 50,
          message: `[${testCase.name}] initial pure root style import shell was not generated`,
          onTick: session.ensureRunning,
        },
        sessionStartedAt,
      )
      outputIntegrityMonitor = createOutputIntegrityMonitor([
        generatedStyleFile,
        ...testCase.watchStyleFiles,
      ].map(file => ({
        file,
        forbiddenFragments: unsafeSelectorFragments,
      })))
      await outputIntegrityMonitor?.assertClean('initial compile')

      const updateStartedAt = Date.now()
      await writeFilePreserveEol(testCase.sourceFile, updatedSource, originalSource)
      await waitFor(
        async () => {
          const output = await inspectRootStyle(testCase.rootStyleFile)
          return session.lastCompileSuccessAt() > updateStartedAt
            && output?.rootStyle === initialRootStyle
            && output.importRequest === initialImportRequest
            && output.generatedStyle.includes('--tw-')
            && output.generatedStyle.includes(testCase.probeValue)
        },
        {
          timeoutMs: ROOT_STYLE_HMR_TIMEOUT_MS,
          pollMs: 50,
          message: `[${testCase.name}] root import shell was not preserved after candidate update`,
          onTick: session.ensureRunning,
        },
        updateStartedAt,
      )
      await outputIntegrityMonitor?.assertClean('candidate update')

      const rollbackStartedAt = Date.now()
      await writeFilePreserveEol(testCase.sourceFile, originalSource, updatedSource)
      await waitFor(
        async () => {
          const output = await inspectRootStyle(testCase.rootStyleFile)
          return session.lastCompileSuccessAt() > rollbackStartedAt
            && output?.rootStyle === initialRootStyle
            && output.importRequest === initialImportRequest
            && output.generatedStyle.includes('--tw-')
            && !output.generatedStyle.includes(testCase.probeValue)
        },
        {
          timeoutMs: ROOT_STYLE_HMR_TIMEOUT_MS,
          pollMs: 50,
          message: `[${testCase.name}] root import shell was not preserved after candidate rollback`,
          onTick: session.ensureRunning,
        },
        rollbackStartedAt,
      )
      await outputIntegrityMonitor?.assertClean('candidate rollback')

      const finalOutput = await inspectRootStyle(testCase.rootStyleFile)
      expect(finalOutput?.generatedStyleFile).toBe(path.resolve(path.dirname(testCase.rootStyleFile), initialImportRequest))
    }
    finally {
      await writeFilePreserveEol(testCase.sourceFile, originalSource, originalSource).catch(() => undefined)
      await session.stop()
      await outputIntegrityMonitor?.stop()
      await outputIntegrityMonitor?.assertClean('shutdown')
    }
  }, ROOT_STYLE_HMR_TEST_TIMEOUT_MS)
})
