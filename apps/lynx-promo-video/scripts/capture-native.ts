import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { appRoot, publicDir, repoRoot } from './paths'

type Platform = 'android' | 'ios'

function platformsFromArgument(argument: string | undefined): Platform[] {
  if (!argument || argument === 'all') {
    return ['android', 'ios']
  }
  if (argument === 'android' || argument === 'ios') {
    return [argument]
  }
  throw new Error('Usage: tsx scripts/capture-native.ts [android|ios|all]')
}

async function command(name: string, args: string[], cwd: string, timeout = 1_800_000) {
  const result = await execa(name, args, { all: true, cwd, reject: false, timeout })
  if (result.exitCode !== 0) {
    throw new Error(`${name} ${args.join(' ')} failed:\n${result.all ?? result.stderr ?? result.stdout ?? result.shortMessage}`)
  }
  return result.all ?? ''
}

async function capture(platform: Platform, bundlePath: string) {
  const rawDir = path.join(appRoot, '.capture', platform)
  const captureDir = path.join(publicDir, 'captures')
  await fs.rm(rawDir, { recursive: true, force: true })
  await Promise.all([
    fs.mkdir(rawDir, { recursive: true }),
    fs.mkdir(captureDir, { recursive: true }),
  ])
  await command('pnpm', [
    'exec',
    'tsx',
    'e2e/lynx/run-native.ts',
    platform,
    '--capture-only',
    '--bundle',
    bundlePath,
    '--output',
    rawDir,
    '--duration',
    '15',
  ], repoRoot)

  const videoPath = path.join(captureDir, `${platform}.mp4`)
  const coverPath = path.join(captureDir, `${platform}-cover.png`)
  await command('ffmpeg', [
    '-y',
    '-i',
    path.join(rawDir, 'raw.mp4'),
    '-an',
    '-vf',
    'fps=30,scale=720:-2:flags=lanczos',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    videoPath,
  ], appRoot)
  await command('ffmpeg', [
    '-y',
    '-ss',
    '3',
    '-i',
    videoPath,
    '-frames:v',
    '1',
    coverPath,
  ], appRoot)
}

async function main() {
  const platforms = platformsFromArgument(process.argv[2])
  await command('pnpm', ['--filter', '@weapp-tailwindcss/example-react-lynx-promo', 'build'], repoRoot)
  const bundlePath = path.join(repoRoot, 'examples', 'react-lynx-promo', 'dist', 'main.lynx.bundle')
  for (const platform of platforms) {
    await capture(platform, bundlePath)
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
