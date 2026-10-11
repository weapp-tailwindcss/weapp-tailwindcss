import fs from 'node:fs/promises'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { createOutputIntegrityMonitor } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/output-integrity'
import { createWatchSession } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { readFileIfExists, waitFor, writeFilePreserveEol } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import {
  hasScopedDarkApplyProbeDisplay,
  hasScopedDarkApplyProbeStyle,
  initialScopedDarkApplyProbeState,
  replaceScopedDarkApplyProbeState,
} from '../scopedDarkApplyProbe'
import { createUniAppCssPostHmrCases } from '../uniAppCssPostHmr'

const CSS_POST_HMR_TIMEOUT_MS = 180_000
const CSS_POST_HMR_TEST_TIMEOUT_MS = CSS_POST_HMR_TIMEOUT_MS + 30_000
const safeIconSelector = '.i-_bmdi--github-circle_B'
const unsafeSelectorFragments = ['.i-\\[', '.before\\:']

const enabled = process.env.E2E_UNI_APP_CSS_POST_HMR === '1'
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const cases = createUniAppCssPostHmrCases(repositoryRoot)

describe.skipIf(!enabled)('uni-app scoped CSS post HMR', () => {
  it.each(cases)('$name never writes raw Tailwind selectors to mini-program styles', async (testCase) => {
    const originalSource = await fs.readFile(testCase.sourceFile, 'utf8')
    const firstUpdatedState = {
      darkBackground: '#242424',
      display: 'block',
    } as const
    const secondUpdatedState = {
      darkBackground: '#252525',
      display: 'inline-flex',
    } as const
    const updatedSource = replaceScopedDarkApplyProbeState(
      originalSource,
      initialScopedDarkApplyProbeState,
      firstUpdatedState,
    )
    const secondUpdatedSource = replaceScopedDarkApplyProbeState(
      updatedSource,
      firstUpdatedState,
      secondUpdatedState,
    )
    expect(updatedSource).not.toBe(originalSource)
    expect(secondUpdatedSource).not.toBe(updatedSource)

    const session = await createWatchSession(testCase.projectRoot, testCase.devScript, { quietSass: true })
    const sessionStartedAt = session.startedAt ?? Date.now()
    let outputIntegrityMonitor: ReturnType<typeof createOutputIntegrityMonitor>

    try {
      await waitFor(
        async () => {
          const [pageStyle, generatedStyle] = await Promise.all([
            readFileIfExists(testCase.outputStyleFile),
            readFileIfExists(testCase.generatedStyleFile),
          ])
          return session.lastCompileSuccessAt() > sessionStartedAt
            && pageStyle != null
            && hasScopedDarkApplyProbeStyle(pageStyle, initialScopedDarkApplyProbeState)
            && generatedStyle?.includes(safeIconSelector) === true
        },
        {
          timeoutMs: CSS_POST_HMR_TIMEOUT_MS,
          pollMs: 50,
          message: `[${testCase.name}] initial scoped and generated styles were not emitted`,
          onTick: session.ensureRunning,
        },
        sessionStartedAt,
      )

      outputIntegrityMonitor = createOutputIntegrityMonitor([
        {
          directory: testCase.outputRoot,
          forbidEmptyBlockAtRules: true,
        },
        ...[
          testCase.outputStyleFile,
          testCase.generatedStyleFile,
        ].map(file => ({
          file,
          forbiddenFragments: unsafeSelectorFragments,
        })),
      ])
      await outputIntegrityMonitor?.assertClean('initial compile')

      const updateStartedAt = Date.now()
      await writeFilePreserveEol(testCase.sourceFile, updatedSource, originalSource)
      await waitFor(
        async () => {
          const [pageStyle, generatedStyle] = await Promise.all([
            readFileIfExists(testCase.outputStyleFile),
            readFileIfExists(testCase.generatedStyleFile),
          ])
          return session.lastCompileSuccessAt() > updateStartedAt
            && pageStyle != null
            && hasScopedDarkApplyProbeStyle(pageStyle, {
              ...firstUpdatedState,
              staleDarkBackgrounds: ['#232323', '#252525'],
            })
            && generatedStyle?.includes(safeIconSelector) === true
        },
        {
          timeoutMs: CSS_POST_HMR_TIMEOUT_MS,
          pollMs: 50,
          message: `[${testCase.name}] scoped Tailwind probe was not adapted`,
          onTick: session.ensureRunning,
        },
        updateStartedAt,
      )
      await outputIntegrityMonitor?.assertClean('scoped style update')

      const secondUpdateStartedAt = Date.now()
      await writeFilePreserveEol(testCase.sourceFile, secondUpdatedSource, updatedSource)
      await waitFor(
        async () => {
          const pageStyle = await readFileIfExists(testCase.outputStyleFile)
          return session.lastCompileSuccessAt() > secondUpdateStartedAt
            && pageStyle != null
            && hasScopedDarkApplyProbeStyle(pageStyle, {
              ...secondUpdatedState,
              staleDarkBackgrounds: ['#232323', '#242424'],
            })
            && !hasScopedDarkApplyProbeDisplay(pageStyle, 'block')
        },
        {
          timeoutMs: CSS_POST_HMR_TIMEOUT_MS,
          pollMs: 50,
          message: `[${testCase.name}] second scoped Tailwind probe update was not emitted`,
          onTick: session.ensureRunning,
        },
        secondUpdateStartedAt,
      )
      await outputIntegrityMonitor?.assertClean('second scoped style update')

      const rollbackStartedAt = Date.now()
      await writeFilePreserveEol(testCase.sourceFile, originalSource, secondUpdatedSource)
      await waitFor(
        async () => {
          const pageStyle = await readFileIfExists(testCase.outputStyleFile)
          return session.lastCompileSuccessAt() > rollbackStartedAt
            && pageStyle != null
            && hasScopedDarkApplyProbeStyle(pageStyle, {
              ...initialScopedDarkApplyProbeState,
              staleDarkBackgrounds: ['#242424', '#252525'],
            })
            && !hasScopedDarkApplyProbeDisplay(pageStyle, 'block')
            && !hasScopedDarkApplyProbeDisplay(pageStyle, 'inline-flex')
        },
        {
          timeoutMs: CSS_POST_HMR_TIMEOUT_MS,
          pollMs: 50,
          message: `[${testCase.name}] scoped Tailwind probe rollback was not emitted`,
          onTick: session.ensureRunning,
        },
        rollbackStartedAt,
      )
      await outputIntegrityMonitor?.assertClean('scoped style rollback')
    }
    finally {
      try {
        await session.stop()
        await outputIntegrityMonitor?.stop()
        await outputIntegrityMonitor?.assertClean('shutdown')
      }
      finally {
        const currentSource = await fs.readFile(testCase.sourceFile, 'utf8').catch(() => originalSource)
        if (currentSource !== originalSource) {
          await writeFilePreserveEol(testCase.sourceFile, originalSource, currentSource).catch(() => undefined)
        }
      }
    }
  }, CSS_POST_HMR_TEST_TIMEOUT_MS)
})
