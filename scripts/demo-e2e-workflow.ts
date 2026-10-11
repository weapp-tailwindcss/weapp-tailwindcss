import type { DemoE2eMemoryStepReport } from './demo-e2e-memory'
import type { WorkflowStep } from './demo-e2e-workflow/quality-steps'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  createDemoE2eMemoryReport,
  writeDemoE2eMemoryReport,
} from './demo-e2e-memory'
import { verifyBaseline } from './demo-e2e-workflow/baseline'
import { createWorkflowCancellation, includeWorkflowCancellation } from './demo-e2e-workflow/cancellation'
import { extendedEnvironment } from './demo-e2e-workflow/extended-environment'
import { extendedBaseline, extendedFrameworkSteps, extendedQualitySteps, extendedRuntimeSteps } from './demo-e2e-workflow/extended-steps'
import { createQualityWorkflowSteps } from './demo-e2e-workflow/quality-steps'
import { runStep } from './demo-e2e-workflow/step'
import { formatWorkflowError, runWithCleanup } from './e2e-preflight/cleanup'
import { enterFullTestGate } from './e2e-preflight/gate'

function createWorkflowSteps(includeLocal: boolean, includeQuality: boolean, baseline?: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [
    ...(includeQuality ? createQualityWorkflowSteps() : []),
    ...(baseline ? extendedQualitySteps() : []),
    {
      name: 'matrix assertions',
      command: 'pnpm',
      args: ['exec', 'vitest', 'run', '-c', './e2e/vitest.e2e.config.ts', 'e2e/e2e-matrix.test.ts'],
    },
    {
      name: 'demo static build snapshots',
      command: 'pnpm',
      args: ['e2e:static'],
    },
    {
      name: 'default multi-platform build outputs',
      command: 'pnpm',
      args: ['e2e:multiplatform-build'],
      env: {
        E2E_MULTIPLATFORM_BUILD_STATUS: 'ci',
        E2E_MULTIPLATFORM_BUILD_CASE: '',
        E2E_MULTIPLATFORM_BUILD_SKIP_BUILD: '0',
      },
    },
    ...(baseline ? extendedFrameworkSteps() : []),
    {
      name: 'WeChat DevTools IDE + visible hot update',
      command: 'pnpm',
      args: ['e2e:mp:ide'],
      env: includeLocal ? { DEMO_VISUAL_REPORT_RESET: '1' } : undefined,
    },
    {
      name: 'demo mini-program watch hot-update',
      command: 'pnpm',
      args: ['e2e:hot-update:demo'],
    },
    {
      name: 'H5 browser build and HMR',
      command: 'pnpm',
      args: ['e2e:h5'],
    },
    {
      name: 'uni-app Vite H5 build and browser HMR',
      command: 'pnpm',
      args: ['e2e:uni:h5'],
    },
  ]

  if (includeLocal) {
    steps.push(
      {
        name: 'HBuilderX uni-app/uni-app x mp-weixin',
        command: 'pnpm',
        args: ['e2e:hbuilderx:mp'],
        local: true,
      },
      {
        name: 'HBuilderX uni-app H5 HMR',
        command: 'pnpm',
        args: ['e2e:hbuilderx:h5'],
        local: true,
      },
      {
        name: 'HBuilderX uni-app/uni-app x Android HMR',
        command: 'pnpm',
        args: ['e2e:android'],
        env: { DEMO_VISUAL_REPORT_RESET: '0' },
        local: true,
      },
      {
        name: 'HBuilderX uni-app/uni-app x iOS HMR',
        command: 'pnpm',
        args: ['e2e:ios'],
        env: { DEMO_VISUAL_REPORT_RESET: '0' },
        local: true,
      },
      {
        name: 'HBuilderX uni-app x Harmony HMR',
        command: 'pnpm',
        args: ['e2e:harmony'],
        local: true,
      },
      ...(['h5', 'harmony'] as const).map(platform => ({
        name: `visual-weapp-h5-app ${platform} screenshots and comparison`,
        command: 'pnpm',
        args: ['exec', 'tsx', 'scripts/demo-visual-e2e-report.ts', `--${platform}-only`, '--fail-on-incomplete'],
        env: {
          DEMO_VISUAL_REPORT_RESET: '0',
          DEMO_VISUAL_MAX_CROSS_PLATFORM_DIFF_RATIO: '0.05',
        },
        local: true,
      })),
    )
  }
  else {
    process.stdout.write('[demo-e2e] skip local HBuilderX mp/H5/Android/iOS/Harmony stages; pass --local to include them.\n')
  }

  return baseline ? [...steps, ...extendedRuntimeSteps(baseline)] : steps
}

export async function runDemoE2eWorkflow(argv = process.argv.slice(2)) {
  const baseline = extendedBaseline(argv)
  const includeLocal = argv.includes('--local')
  const includeQuality = argv.includes('--quality')
  if (includeQuality && !includeLocal) {
    throw new Error('--quality 必须配合 --local 和本轮 --preflight-report，在全面测试门禁内执行。')
  }
  const reportIndex = argv.indexOf('--preflight-report')
  const cancellation = createWorkflowCancellation()
  let gate: Awaited<ReturnType<typeof enterFullTestGate>> | undefined
  const stepReports: DemoE2eMemoryStepReport[] = []
  let exitCode = 0
  let workflowError: string | undefined
  const writeReport = async () => {
    const report = createDemoE2eMemoryReport({ repositoryRoot: process.cwd(), includeLocal, exitCode, steps: stepReports, ...(workflowError ? { error: workflowError } : {}) })
    const result = await writeDemoE2eMemoryReport({ report })
    process.stdout.write(`[demo-e2e] memory report: ${path.relative(process.cwd(), result.markdownFile)}\n`)
  }
  try {
    await runWithCleanup(() => runWithCleanup(async () => {
      gate = includeLocal ? await enterFullTestGate(reportIndex < 0 ? undefined : argv[reportIndex + 1], process.cwd(), Boolean(baseline)) : undefined
      cancellation.signal.throwIfAborted()
      const verifiedBaseline = baseline ? await verifyBaseline(baseline) : undefined
      const steps = createWorkflowSteps(includeLocal, includeQuality, verifiedBaseline)
      const workflowEnv = { ...(baseline ? extendedEnvironment(process.env) : process.env), ...cancellation.env }
      for (const [index, step] of steps.entries()) {
        try {
          cancellation.signal.throwIfAborted()
          await gate?.check(step.name)
          cancellation.signal.throwIfAborted()
          stepReports.push(await runStep(step, index + 1, steps.length, gate?.env, workflowEnv, cancellation.signal))
          await writeReport()
        }
        catch (error) {
          const stepReport = error && typeof error === 'object' ? (error as { stepReport?: DemoE2eMemoryStepReport }).stepReport : undefined
          if (stepReport) {
            stepReports.push(stepReport)
          }
          exitCode = 1
          workflowError = formatWorkflowError(error)
          try {
            await writeReport()
          }
          catch (reportError) {
            throw new AggregateError([error, reportError], '阶段失败且无法写入内存报告。', { cause: error })
          }
          throw error
        }
      }
    }, () => gate?.close()), () => cancellation.dispose())
    cancellation.signal.throwIfAborted()
  }
  catch (caught) {
    const error = includeWorkflowCancellation(caught, cancellation.signal)
    exitCode = 1
    workflowError = formatWorkflowError(error)
    try {
      await writeReport()
    }
    catch (reportError) {
      throw new AggregateError([error, reportError], '工作流失败且最终报告写入失败。', { cause: error })
    }
    throw error
  }
  process.stdout.write('[demo-e2e] workflow passed\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDemoE2eWorkflow().catch((error) => {
    process.stderr.write(`${formatWorkflowError(error)}\n`)
    process.exitCode = 1
  })
}
