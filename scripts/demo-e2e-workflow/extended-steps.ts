import type { WorkflowStep } from './quality-steps'
import { hostNativeTarget } from '../../packages/weapp-tailwindcss/native/targets.mjs'

function step(name: string, args: string[], env?: Record<string, string>): WorkflowStep {
  return { name, command: 'pnpm', args, env, local: true }
}

export function extendedBaseline(argv: string[]): string | undefined {
  if (!argv.includes('--extended')) {
    return undefined
  }
  if (!argv.includes('--local') || !argv.includes('--quality')) {
    throw new Error('--extended 必须配合 --local --quality 和本轮预检报告。')
  }
  const index = argv.indexOf('--baseline-ref')
  const baseline = index < 0 ? undefined : argv[index + 1]
  if (!baseline || !/^[a-f\d]{40}$/i.test(baseline)) {
    throw new Error('--extended 必须提供 --baseline-ref <任务起始提交的完整 SHA>，不能使用移动的分支名。')
  }
  return baseline
}

export function extendedQualitySteps(): WorkflowStep[] {
  return [
    step('extended package declaration tests', ['tsd']),
    step('extended package and website typecheck', [
      '--filter',
      '@weapp-tailwindcss/engine',
      '--filter',
      '@weapp-tailwindcss/env',
      '--filter',
      '@weapp-tailwindcss/source-scan',
      '--filter',
      '@weapp-tailwindcss/escape',
      '--filter',
      '@weapp-tailwindcss/website',
      '--filter',
      '@weapp-tailwindcss/css-compat',
      'run',
      'typecheck',
    ]),
    step('extended stylelint', ['stylelint']),
    step('extended Rust native ABI', ['native:ci', `--target=${hostNativeTarget()}`]),
    step('extended packed package consumption', ['release:verify']),
    ...['test:package', 'properties:check', 'test:consumers', 'test:browser'].map(command => step(
      command === 'test:browser' ? 'extended CSS browser parity' : `extended CSS compatibility ${command}`,
      ['--filter', '@weapp-tailwindcss/css-compat', command],
    )),
    step('extended website script regression', ['--filter', '@weapp-tailwindcss/website', 'exec', 'vitest', 'run', 'scripts/docs-deployment.test.ts', 'scripts/deploy-docs-cloudflare.test.mjs', 'scripts/local-worker/server.test.ts', 'scripts/local-worker/command.test.ts', '--update=none']),
    ...['check:docs-audience', 'seo:quality:strict', 'test:worker', 'deploy:worker:dry-run', 'e2e:local'].map(command => step(
      command === 'e2e:local' ? 'extended website browser runtime' : `extended website quality ${command}`,
      ['--filter', '@weapp-tailwindcss/website', command],
    )),
    step('extended agents regression', ['agents:test', '--update=none']),
    step('extended demo matrix regression', ['test:demo:matrix']),
    step('extended performance tooling regression', ['test:perf:demo']),
    step('extended public skills validation', ['skills:validate']),
    step('extended package documentation', ['docs:packages:check']),
  ]
}

export function extendedFrameworkSteps(): WorkflowStep[] {
  return [
    step('extended preprocessor outputs', ['e2e:preprocessor']),
    step('extended demo user workflow', ['e2e:demo-user-workflow']),
    step('extended framework support contracts', ['exec', 'vitest', 'run', '-c', './e2e/vitest.e2e.config.ts', 'e2e/framework-ci-support.test.ts', '--update=none'], { E2E_FRAMEWORK_SUPPORT: '1' }),
    step('extended template builds', ['e2e:templates']),
    step('extended template HMR outputs', ['e2e:templates:hmr']),
    step('extended template WeChat IDE runtime', ['e2e:templates:ide']),
    step('extended development startup matrix', ['e2e:dev:smoke']),
  ]
}

export function extendedRuntimeSteps(baseline: string): WorkflowStep[] {
  return [
    step('React Native web runtime', ['e2e:react-native:web']),
    step('React Native Android runtime', ['e2e:react-native:android']),
    step('React Native iOS runtime', ['e2e:react-native:ios']),
    step('Lynx Android runtime', ['e2e:lynx:android']),
    step('Lynx iOS runtime', ['e2e:lynx:ios']),
    step('extended synthetic performance guard', ['perf:synthetic:guard']),
    step('extended framework performance guard', ['perf:guard', '--baseline-ref', baseline]),
  ]
}
