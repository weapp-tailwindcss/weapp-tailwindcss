import type { ProjectEntry } from './shared'
import process from 'node:process'
import { E2E_PROJECTS } from './projectEntries'

type FixturesDir = '../demo'
type SupportTier = 'required' | 'exempt'

export interface FrameworkSupportCase {
  name: string
  framework: string
  builder: string
  tailwindcss: 'v3' | 'v4'
  fixturesDir: FixturesDir
  project: ProjectEntry
  snapshotProjectName?: string
  ci: {
    tier: SupportTier
    reason?: string
  }
  ide: {
    tier: SupportTier
    reason?: string
  }
}

function e2eProject(name: string) {
  const project = E2E_PROJECTS.find(item => item.name === name)
  if (!project) {
    throw new Error(`Unknown demo e2e project: ${name}`)
  }
  return project
}

function supportCase(options: FrameworkSupportCase): FrameworkSupportCase {
  return options
}

export const FRAMEWORK_SUPPORT_CASES = [
  supportCase({
    name: 'gulp-tailwindcss-v4',
    framework: 'native',
    builder: 'gulp',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('gulp-tailwindcss-v4'),
    ci: { tier: 'required' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'mpx-tailwindcss-v4',
    framework: 'mpx',
    builder: 'webpack5',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('mpx-tailwindcss-v4'),
    ci: { tier: 'required' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'taro-webpack-react-tailwindcss-v4',
    framework: 'taro-react',
    builder: 'webpack5',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('taro-webpack-react-tailwindcss-v4'),
    ci: { tier: 'required' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'taro-vite-react-tailwindcss-v4',
    framework: 'taro-react',
    builder: 'vite',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('taro-vite-react-tailwindcss-v4'),
    ci: { tier: 'required' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'taro-webpack-vue3-tailwindcss-v4',
    framework: 'taro-vue3',
    builder: 'webpack5',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('taro-webpack-vue3-tailwindcss-v4'),
    ci: { tier: 'required' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'taro-vite-vue3-tailwindcss-v4',
    framework: 'taro-vue3',
    builder: 'vite',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('taro-vite-vue3-tailwindcss-v4'),
    ci: { tier: 'required' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'uni-app-vite-tailwindcss-v4',
    framework: 'uni-app',
    builder: 'vite',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('uni-app-vite-tailwindcss-v4'),
    ci: { tier: 'required' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    framework: 'uni-app',
    builder: 'vite-hbuilderx',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('uni-app-vite-vue3-hbuilderx-tailwindcss-v4'),
    ci: { tier: 'exempt', reason: 'HBuilderX CLI 小程序链路依赖本机 HBuilderX 与微信开发者工具，本地 IDE E2E 覆盖。' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'uni-app-x-vdom-tailwindcss-v4',
    framework: 'uni-app-x',
    builder: 'hbuilderx',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('uni-app-x-vdom-tailwindcss-v4'),
    ci: { tier: 'exempt', reason: 'uni-app-x 小程序链路依赖本机 HBuilderX 与微信开发者工具，本地 IDE E2E 覆盖。' },
    ide: { tier: 'required' },
  }),
  supportCase({
    name: 'weapp-vite-tailwindcss-v4',
    framework: 'native',
    builder: 'weapp-vite',
    tailwindcss: 'v4',
    fixturesDir: '../demo',
    project: e2eProject('weapp-vite-tailwindcss-v4'),
    ci: { tier: 'required' },
    ide: { tier: 'required' },
  }),
] as const satisfies FrameworkSupportCase[]

export function getFrameworkCiCases() {
  return filterFrameworkCases(FRAMEWORK_SUPPORT_CASES.filter(item => item.ci.tier === 'required'))
}

export function getFrameworkIdeCases() {
  return filterFrameworkCases(FRAMEWORK_SUPPORT_CASES.filter(item => item.ide.tier === 'required'))
}

export function getFrameworkIdeExemptCases() {
  return filterFrameworkCases(FRAMEWORK_SUPPORT_CASES.filter(item => item.ide.tier === 'exempt'))
}

function filterFrameworkCases<T extends FrameworkSupportCase>(cases: readonly T[]): T[] {
  const filter = process.env['E2E_PROJECT_FILTER']
  if (!filter) {
    return [...cases]
  }

  const pattern = new RegExp(filter)
  return cases.filter(item => pattern.test(item.name) || pattern.test(item.project.name))
}
