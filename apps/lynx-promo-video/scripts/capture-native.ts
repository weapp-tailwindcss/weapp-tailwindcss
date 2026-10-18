import type { CaptureManifest, CapturePlatform, SourceSnapshot } from './capture/manifest'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { digestFile, manifestRelativePath, readCaptureManifest, snapshotSources, writeCaptureManifest } from './capture/manifest'
import { allocateCaptureOutput, preservePublishedCapture } from './capture/output'
import { appRoot, publicDir, repoRoot } from './paths'

function platformsFromArgument(argument: string | undefined): CapturePlatform[] {
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

async function capture(platform: CapturePlatform, bundlePath: string, source: SourceSnapshot) {
  const captureRoot = path.join(appRoot, '.capture')
  const { runDir, rawDir } = await allocateCaptureOutput(captureRoot, platform)
  const captureDir = path.join(publicDir, 'captures')
  await fs.mkdir(captureDir, { recursive: true })
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
    '18',
    ...(platform === 'ios' ? ['--scroll'] : []),
  ], repoRoot)

  const videoPath = path.join(runDir, `${platform}.mp4`)
  const coverPath = path.join(runDir, `${platform}-cover.png`)
  await command('ffmpeg', [
    '-n',
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
    '-n',
    '-ss',
    '1',
    '-i',
    videoPath,
    '-frames:v',
    '1',
    coverPath,
  ], appRoot)

  const manifestFile = path.resolve(process.env.LYNX_PROMO_CAPTURE_MANIFEST ?? path.join(captureDir, 'manifest.json'))
  const previous = await fs.stat(manifestFile).catch(() => undefined)
  const manifest: CaptureManifest = previous
    ? await readCaptureManifest(manifestFile)
    : { version: 1, createdAt: new Date().toISOString(), source, platforms: {} }
  const publishedVideo = path.join(captureDir, `${platform}.mp4`)
  const publishedCover = path.join(captureDir, `${platform}-cover.png`)
  await preservePublishedCapture([publishedVideo, publishedCover, manifestFile], captureRoot)
  await fs.copyFile(videoPath, publishedVideo)
  await fs.copyFile(coverPath, publishedCover)
  const device = JSON.parse(await fs.readFile(path.join(rawDir, 'device.json'), 'utf8')) as Record<string, unknown>
  const stagedBundle = await digestFile(path.join(rawDir, 'main.lynx.bundle'))
  manifest.createdAt = new Date().toISOString()
  manifest.source = { ...source, root: manifestRelativePath(manifestFile, source.root) }
  manifest.platforms[platform] = {
    device,
    runtime: `e2e/lynx/run-native.ts ${platform} --capture-only`,
    sourceSha256: source.sha256,
    rawVideo: manifestRelativePath(manifestFile, path.join(rawDir, 'raw.mp4')),
    video: manifestRelativePath(manifestFile, publishedVideo),
    cover: manifestRelativePath(manifestFile, publishedCover),
    bundle: { ...stagedBundle, path: manifestRelativePath(manifestFile, stagedBundle.path) },
  }
  await writeCaptureManifest(manifestFile, manifest)
  process.stdout.write(`${JSON.stringify({ platform, rawDir, manifestFile }, null, 2)}\n`)
}

async function main() {
  const platforms = platformsFromArgument(process.argv[2])
  const source = await snapshotSources(path.join(repoRoot, 'examples', 'react-lynx-promo'))
  await command('pnpm', ['--filter', '@weapp-tailwindcss/example-react-lynx-promo', 'build'], repoRoot)
  const bundlePath = path.join(repoRoot, 'examples', 'react-lynx-promo', 'dist', 'main.lynx.bundle')
  for (const platform of platforms) {
    await capture(platform, bundlePath, source)
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
