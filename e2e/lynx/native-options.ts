import path from 'node:path'
import process from 'node:process'

export type NativePlatform = 'android' | 'ios'

export interface NativeRunOptions {
  platform: NativePlatform
  bundlePath: string | undefined
  assetsPath?: string
  captureOnly: boolean
  captureScroll: boolean
  outputDir: string | undefined
  captureDurationSeconds: number
}

export function iosPodInstallArguments(repoUpdate = process.env['LYNX_IOS_POD_REPO_UPDATE'] === '1') {
  return repoUpdate ? ['install', '--repo-update'] : ['install']
}

/** 兼容性回归沿用原有 context，仅显式原生滚动录制携带本轮时长。 */
export function stageNativeRunContext<T extends object>(context: T, options: Pick<NativeRunOptions, 'captureScroll' | 'captureDurationSeconds'>) {
  return options.captureScroll ? { ...context, captureScroll: true, captureDurationSeconds: options.captureDurationSeconds } : context
}

function optionValue(argv: string[], name: string) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return undefined
  }
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`)
  }
  return value
}

export function parseNativeRunArgs(argv: string[], cwd = process.cwd()): NativeRunOptions {
  const [platform] = argv
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error('Usage: tsx e2e/lynx/run-native.ts <android|ios> [--capture-only --bundle <path> --assets <dir> --output <dir> --duration <seconds> [--scroll]]')
  }
  const captureOnly = argv.includes('--capture-only')
  const captureScroll = argv.includes('--scroll')
  const bundle = optionValue(argv, '--bundle')
  const assets = optionValue(argv, '--assets')
  const output = optionValue(argv, '--output')
  const durationSource = optionValue(argv, '--duration')
  const captureDurationSeconds = durationSource ? Number(durationSource) : 15
  if (!Number.isInteger(captureDurationSeconds) || captureDurationSeconds < 5 || captureDurationSeconds > 180) {
    throw new Error('--duration must be an integer between 5 and 180 seconds.')
  }
  if (captureOnly && !bundle) {
    throw new Error('--capture-only requires --bundle.')
  }
  if (assets && !captureOnly) {
    throw new Error('--assets requires --capture-only.')
  }
  if (captureScroll && (!captureOnly || platform !== 'ios')) {
    throw new Error('--scroll requires ios --capture-only.')
  }
  if (captureScroll && captureDurationSeconds < 8) {
    throw new Error('--scroll requires --duration of at least 8 seconds to record both native offsets.')
  }
  return {
    platform,
    captureOnly,
    captureScroll,
    bundlePath: bundle ? path.resolve(cwd, bundle) : undefined,
    ...(assets ? { assetsPath: path.resolve(cwd, assets) } : {}),
    outputDir: output ? path.resolve(cwd, output) : undefined,
    captureDurationSeconds,
  }
}
