import fs from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import fg from 'fast-glob'
import path from 'pathe'
import { describe, expect, it } from 'vitest'

interface StarterBuildCase {
  name: string
  starter: string
  command: string[]
  outputDir: string
  requiredFiles: string[]
  styleTargets: string[]
  textTargets: string[]
  expectTransformedMarkers?: boolean
  requireReadableStyles?: boolean
}

const repoRoot = path.resolve(__dirname, '..')
const starterRoot = path.resolve(repoRoot, 'starter')
const rawTailwindDirectiveRE = /(?:^|[;{}\n])\s*@(import\s+["']tailwindcss|tailwind|apply|theme|source)\b/
const transformedClassMarkerRE = /_b[\w-]+_B/
const styleFileRE = /\.(?:css|wxss|acss|jxss|qss|ttss)$/i
const textFileRE = /\.(?:html|js|json|ts|wxml|axml|qml|ttml)$/i

const starterBuildCases: StarterBuildCase[] = [
  {
    name: 'taro-webpack-react weapp',
    starter: 'taro-webpack-react',
    command: ['pnpm', 'run', 'build:weapp'],
    outputDir: 'dist',
    requiredFiles: ['dist/app.js', 'dist/app.json', 'dist/app.wxss', 'dist/pages/index/index.wxml'],
    styleTargets: ['dist/app.wxss', 'dist/app-origin.wxss'],
    textTargets: ['dist/pages/index/index.wxml', 'dist/pages/index/index.js'],
  },
  {
    name: 'taro-webpack-react h5',
    starter: 'taro-webpack-react',
    command: ['pnpm', 'run', 'build:h5'],
    outputDir: 'dist',
    requiredFiles: ['dist/index.html'],
    styleTargets: ['dist/css'],
    textTargets: ['dist/index.html'],
    expectTransformedMarkers: false,
  },
  {
    name: 'taro-vite-react weapp',
    starter: 'taro-vite-react',
    command: ['pnpm', 'run', 'build:weapp'],
    outputDir: 'dist',
    requiredFiles: ['dist/app.js', 'dist/app.json', 'dist/app.wxss', 'dist/pages/index/index.wxml'],
    styleTargets: ['dist/app.wxss', 'dist/app-origin.wxss'],
    textTargets: ['dist/pages/index/index.wxml', 'dist/pages/index/index.js'],
  },
  {
    name: 'taro-vite-react h5',
    starter: 'taro-vite-react',
    command: ['pnpm', 'run', 'build:h5'],
    outputDir: 'dist',
    requiredFiles: ['dist/index.html'],
    styleTargets: ['dist/css'],
    textTargets: ['dist/index.html'],
    expectTransformedMarkers: false,
    requireReadableStyles: false,
  },
  {
    name: 'uni-app-vite mp-weixin',
    starter: 'uni-app-vite',
    command: ['pnpm', 'run', 'build:mp-weixin'],
    outputDir: 'dist/build/mp-weixin',
    requiredFiles: [
      'dist/build/mp-weixin/app.js',
      'dist/build/mp-weixin/app.json',
      'dist/build/mp-weixin/app.wxss',
      'dist/build/mp-weixin/pages/index/index.wxml',
    ],
    styleTargets: ['dist/build/mp-weixin/app.wxss', 'dist/build/mp-weixin/common'],
    textTargets: ['dist/build/mp-weixin/pages/index/index.wxml'],
  },
  {
    name: 'uni-app-vite h5',
    starter: 'uni-app-vite',
    command: ['pnpm', 'run', 'build:h5'],
    outputDir: 'dist/build/h5',
    requiredFiles: ['dist/build/h5/index.html'],
    styleTargets: ['dist/build/h5/assets', 'dist/build/h5/static'],
    textTargets: ['dist/build/h5/index.html'],
    expectTransformedMarkers: false,
  },
  {
    name: 'mpx weixin',
    starter: 'mpx',
    command: ['pnpm', 'run', 'build'],
    outputDir: 'dist/wx',
    requiredFiles: ['dist/wx/app.js', 'dist/wx/app.json', 'dist/wx/app.wxss', 'dist/wx/pages/index.wxml'],
    styleTargets: ['dist/wx/app.wxss', 'dist/wx/styles'],
    textTargets: ['dist/wx/pages/index.wxml'],
  },
  {
    name: 'weapp-vite weixin',
    starter: 'weapp-vite',
    command: ['pnpm', 'run', 'build'],
    outputDir: 'dist',
    requiredFiles: ['dist/app.js', 'dist/app.json', 'dist/app.wxss', 'dist/pages/index/index.wxml'],
    styleTargets: ['dist/app.wxss'],
    textTargets: ['dist/pages/index/index.wxml'],
  },
  {
    name: 'gulp weixin',
    starter: 'gulp',
    command: ['pnpm', 'run', 'build'],
    outputDir: 'dist',
    requiredFiles: ['dist/app.js', 'dist/app.json', 'dist/app.wxss', 'dist/pages/index/index.wxml'],
    styleTargets: ['dist/app.wxss'],
    textTargets: ['dist/pages/index/index.wxml'],
  },
  {
    name: 'gulp tt',
    starter: 'gulp',
    command: ['pnpm', 'run', 'build:tt'],
    outputDir: 'dist',
    requiredFiles: ['dist/app.js', 'dist/app.json', 'dist/app.ttss', 'dist/pages/index/index.ttml'],
    styleTargets: ['dist/app.ttss'],
    textTargets: ['dist/pages/index/index.ttml'],
  },
]

function shouldRunCase(name: string) {
  const filter = process.env['E2E_STARTER_CASE']
  if (!filter) {
    return true
  }
  return new RegExp(filter).test(name)
}

async function pathExists(file: string) {
  try {
    await fs.access(file)
    return true
  }
  catch {
    return false
  }
}

async function readTextTargets(root: string, targets: string[], fileRE: RegExp) {
  const texts: string[] = []
  for (const target of targets) {
    const absolute = path.resolve(root, target)
    let stat
    try {
      stat = await fs.stat(absolute)
    }
    catch (error: any) {
      if (error?.code === 'ENOENT') {
        continue
      }
      throw error
    }
    if (stat.isFile()) {
      if (fileRE.test(absolute)) {
        texts.push(await fs.readFile(absolute, 'utf8'))
      }
      continue
    }

    const files = await fg('**/*', {
      absolute: true,
      cwd: absolute,
      onlyFiles: true,
    })
    for (const file of files.sort()) {
      if (fileRE.test(file)) {
        texts.push(await fs.readFile(file, 'utf8'))
      }
    }
  }
  return texts.join('\n')
}

async function runPnpm(args: string[], cwd: string) {
  return execa('pnpm', args, {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      BROWSERSLIST_ENV: 'production',
      TARO_BUILD_STRICT: '1',
      UNI_BUILD_STRICT: '1',
      npm_package_json: path.resolve(cwd, 'package.json'),
      INIT_CWD: cwd,
    },
    all: true,
    stdout: process.env['E2E_DEBUG_BUILD'] === '1' ? ['pipe', 'inherit'] : 'pipe',
    stderr: process.env['E2E_DEBUG_BUILD'] === '1' ? ['pipe', 'inherit'] : 'pipe',
  })
}

async function clearBuildState(root: string) {
  await fs.rm(path.resolve(root, 'dist'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'unpackage'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'node_modules/.cache'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'node_modules/.vite'), { recursive: true, force: true })
}

describe('starter build smoke', () => {
  it('keeps every starter covered by the build matrix', async () => {
    const packageFiles = await fg('*/package.json', {
      cwd: starterRoot,
      onlyFiles: true,
    })
    const starterNames = packageFiles.map(file => file.split('/')[0]).sort()
    expect(new Set(starterBuildCases.map(item => item.starter))).toEqual(new Set(starterNames))
  })

  it.each(starterBuildCases.filter(item => shouldRunCase(item.name)))('$name', async (item) => {
    if (process.env['E2E_STARTER_SKIP_BUILD'] === '1') {
      return
    }

    const root = path.resolve(starterRoot, item.starter)
    await clearBuildState(root)
    const build = await runPnpm(item.command.slice(1), root)
    if (item.starter === 'gulp') {
      expect(build.all, `${item.name} should complete its ESM task graph`).toContain('Finished \'default\'')
      expect(build.all, `${item.name} should load its TypeScript runtime without fallback failures`).not.toMatch(/Failed to (?:preload|load) external module:/)
    }

    expect(await pathExists(path.resolve(root, item.outputDir)), `${item.name} should emit ${item.outputDir}`).toBe(true)
    for (const file of item.requiredFiles) {
      expect(await pathExists(path.resolve(root, file)), `${item.name} should emit ${file}`).toBe(true)
    }

    const styles = await readTextTargets(root, item.styleTargets, styleFileRE)
    if (item.requireReadableStyles !== false) {
      expect(styles.length, `${item.name} should emit readable styles`).toBeGreaterThan(0)
    }
    expect(styles, `${item.name} styles should not contain raw Tailwind directives`).not.toMatch(rawTailwindDirectiveRE)

    const texts = await readTextTargets(root, item.textTargets, textFileRE)
    const combined = `${styles}\n${texts}`
    if (item.expectTransformedMarkers === false) {
      expect(combined, `${item.name} should keep web class output`).not.toMatch(transformedClassMarkerRE)
    }
    else {
      expect(combined, `${item.name} should include transformed arbitrary class markers`).toMatch(transformedClassMarkerRE)
    }
  }, 1_200_000)
})
