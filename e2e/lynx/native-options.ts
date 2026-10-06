import path from 'node:path'
import process from 'node:process'

export type NativePlatform = 'android' | 'ios'

export interface NativeRunOptions {
  platform: NativePlatform
  bundlePath: string | undefined
  captureOnly: boolean
  outputDir: string | undefined
  captureDurationSeconds: number
}

export function iosPodInstallArguments(repoUpdate = process.env['LYNX_IOS_POD_REPO_UPDATE'] === '1') {
  return repoUpdate ? ['install', '--repo-update'] : ['install']
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
    throw new Error('Usage: tsx e2e/lynx/run-native.ts <android|ios> [--capture-only --bundle <path> --output <dir> --duration <seconds>]')
  }
  const captureOnly = argv.includes('--capture-only')
  const bundle = optionValue(argv, '--bundle')
  const output = optionValue(argv, '--output')
  const durationSource = optionValue(argv, '--duration')
  const captureDurationSeconds = durationSource ? Number(durationSource) : 15
  if (!Number.isInteger(captureDurationSeconds) || captureDurationSeconds < 5 || captureDurationSeconds > 180) {
    throw new Error('--duration must be an integer between 5 and 180 seconds.')
  }
  if (captureOnly && !bundle) {
    throw new Error('--capture-only requires --bundle.')
  }
  return {
    platform,
    captureOnly,
    bundlePath: bundle ? path.resolve(cwd, bundle) : undefined,
    outputDir: output ? path.resolve(cwd, output) : undefined,
    captureDurationSeconds,
  }
}
