import type { BuildOutputCase } from './types'

export const rawTailwindDirectiveRE = /@(import\s+["']tailwindcss|tailwind|apply|theme|source|utility|variant|custom-variant|reference|config|plugin)\b/

const MINI_PROGRAM_PLATFORM_NAMES = new Set([
  'ali',
  'alipay',
  'dd',
  'jd',
  'qq',
  'swan',
  'tt',
  'weapp',
  'wx',
])

export function isMiniProgramTarget(target: Pick<BuildOutputCase, 'framework' | 'platform'>) {
  return target.framework === 'gulp'
    || target.framework === 'mpx'
    || target.platform.startsWith('mp-')
    || MINI_PROGRAM_PLATFORM_NAMES.has(target.platform)
}

export function createLocalTargetCase(options: {
  name: string
  framework: BuildOutputCase['framework']
  projectDir: string
  platform: string
  reason: string
}): BuildOutputCase {
  return {
    name: options.name,
    framework: options.framework,
    projectDir: options.projectDir,
    platform: options.platform,
    command: ['node', '-e', 'process.exit(0)'],
    outputDir: '.',
    requiredFiles: ['package.json'],
    styleFiles: ['package.json'],
    styleContains: [],
    forbidEmptyBlockAtRules: isMiniProgramTarget(options),
    verifySourceFixtures: false,
    status: 'local',
    reason: options.reason,
  }
}

export function uniqueTargetKey(item: {
  framework: string
  projectDir: string
  platform: string
}) {
  return `${item.framework}:${item.projectDir}:${item.platform}`
}
