import type { BuildOutputCase } from './types'
import fs from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import fg from 'fast-glob'
import path from 'pathe'
import { expect } from 'vitest'
import { collectEmptyCssBlocks } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/css-integrity'
import { clearProjectBuildState } from '../projectTest'

const styleExtensions = /\.(?:css|wxss|acss|jxss|qss|ttss)$/i
const textExtensions = /\.(?:js|json|html|css|wxss|acss|jxss|qss|ttss|wxml|axml|qml|swan|ttml|uvue)$/i
const iconifyBuildSourceNeedle = 'i-[mdi--github-circle]'
const iconifyMiniStyleSelectors = [
  '.i-_bmdi--github-circle_B',
  '.i-_bmdi--star_B',
  '.i-_bsvg-spinners--180-ring-with-bg_B',
] as const
const iconifyWebStyleSelectors = [
  '.i-\\[mdi--github-circle\\]',
  '.i-\\[mdi--star\\]',
  '.i-\\[svg-spinners--180-ring-with-bg\\]',
] as const
const unsafeMiniProgramSelectorFragments = [
  '.i-\\[',
  '.before\\:',
] as const
const safeMiniProgramContentSelector = '.before_ccontent-'

interface ReadOutputResult {
  files: string[]
  text: string
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

async function readMaybeDirectory(
  root: string,
  target: string,
  options: {
    extensions?: RegExp | undefined
  } = {},
): Promise<ReadOutputResult> {
  const absolute = path.resolve(root, target)
  const stat = await fs.stat(absolute)
  if (stat.isFile()) {
    return {
      files: [absolute],
      text: await fs.readFile(absolute, 'utf8'),
    }
  }

  const files = await fg('**/*', {
    absolute: true,
    cwd: absolute,
    onlyFiles: true,
  })
  const texts: string[] = []
  const extensions = options.extensions ?? textExtensions
  for (const file of files.sort()) {
    if (extensions.test(file)) {
      texts.push(await fs.readFile(file, 'utf8'))
    }
  }
  return {
    files: files.sort(),
    text: texts.join('\n'),
  }
}

async function hasIconifyBuildFixture(projectRoot: string) {
  const files = await fg('**/*.{css,scss,less}', {
    absolute: true,
    cwd: projectRoot,
    ignore: [
      'dist/**',
      'node_modules/**',
      'unpackage/**',
      '.output/**',
    ],
    onlyFiles: true,
  })

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8')
    if (content.includes(iconifyBuildSourceNeedle)) {
      return true
    }
  }

  return false
}

function iconifyStyleSelectorsForPlatform(platform: string) {
  return platform === 'h5' || platform === 'h5:ssr' || platform === 'web'
    ? iconifyWebStyleSelectors
    : iconifyMiniStyleSelectors
}

function expectNeedle(content: string, needle: string | RegExp, label: string) {
  if (typeof needle === 'string') {
    expect(content, label).toContain(needle)
    return
  }
  expect(content, label).toMatch(needle)
}

async function runBuildCase(item: BuildOutputCase, projectRoot: string, repoRoot: string) {
  await clearProjectBuildState(projectRoot)

  const [command, ...args] = item.command
  const cwd = item.commandCwd === 'repo' ? repoRoot : projectRoot
  await execa(command, args, {
    cwd,
    env: {
      ...process.env,
      ...item.env,
      NODE_ENV: 'production',
      BROWSERSLIST_ENV: 'production',
      TARO_BUILD_STRICT: '1',
      UNI_BUILD_STRICT: '1',
      npm_package_json: path.resolve(projectRoot, 'package.json'),
      INIT_CWD: projectRoot,
    },
    stdio: process.env['E2E_DEBUG_BUILD'] === '1' ? 'inherit' : 'pipe',
  })
}

export async function verifyBuildOutputCase(item: BuildOutputCase) {
  const repoRoot = path.resolve(__dirname, '../..')
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  const outputRoot = path.resolve(projectRoot, item.outputDir)
  const skipBuild = process.env['E2E_MULTIPLATFORM_BUILD_SKIP_BUILD'] === '1'

  if (!skipBuild) {
    await runBuildCase(item, projectRoot, repoRoot)
  }

  expect(await pathExists(outputRoot), `${item.name} should emit ${item.outputDir}`).toBe(true)

  for (const file of item.requiredFiles) {
    expect(await pathExists(path.resolve(projectRoot, file)), `${item.name} should emit ${file}`).toBe(true)
  }

  const styleOutputs = await Promise.all(item.styleFiles.map(file => readMaybeDirectory(projectRoot, file, {
    extensions: styleExtensions,
  })))
  const styleFiles = styleOutputs.flatMap(output => output.files)
  const styles = styleOutputs.map(output => output.text).join('\n')
  expect(styles.length, `${item.name} should emit readable style output`).toBeGreaterThan(0)
  if (item.styleFileExtensions?.length) {
    const emittedExtensions = new Set(styleFiles.map(file => path.extname(file).toLowerCase()))
    const hasExpectedStyleExtension = item.styleFileExtensions.some(ext => emittedExtensions.has(ext))
    expect(
      hasExpectedStyleExtension,
      `${item.name} should emit style output with one of ${item.styleFileExtensions.join(', ')}`,
    ).toBe(true)
  }
  if (item.forbidEmptyBlockAtRules) {
    for (const file of styleFiles.filter(file => styleExtensions.test(file))) {
      const source = await fs.readFile(file, 'utf8')
      expect(
        collectEmptyCssBlocks(source),
        `${item.name} ${path.relative(projectRoot, file)} should not emit empty CSS blocks`,
      ).toEqual([])
    }
  }
  for (const needle of item.styleContains) {
    expectNeedle(styles, needle, `${item.name} style output should contain ${String(needle)}`)
  }
  if (item.verifySourceFixtures !== false && await hasIconifyBuildFixture(projectRoot)) {
    for (const selector of iconifyStyleSelectorsForPlatform(item.platform)) {
      expect(
        styles,
        `${item.name} style output should keep Iconify bracket selector ${selector}`,
      ).toContain(selector)
    }
    if (item.platform !== 'h5' && item.platform !== 'h5:ssr' && item.platform !== 'web') {
      expect(
        styles,
        `${item.name} style output should keep mini-program-safe content selectors`,
      ).toContain(safeMiniProgramContentSelector)
      for (const fragment of unsafeMiniProgramSelectorFragments) {
        expect(
          styles,
          `${item.name} style output should not contain raw CSS selector escape ${fragment}`,
        ).not.toContain(fragment)
      }
    }
  }

  const texts = item.textFiles
    ? (await Promise.all(item.textFiles.map(file => readMaybeDirectory(projectRoot, file)))).map(output => output.text).join('\n')
    : ''
  for (const needle of item.textContains ?? []) {
    expectNeedle(texts, needle, `${item.name} text output should contain ${String(needle)}`)
  }

  for (const assertion of item.fileAssertions ?? []) {
    const file = path.resolve(projectRoot, assertion.file)
    expect(await pathExists(file), `${item.name} should emit ${assertion.file}`).toBe(true)
    const content = (await readMaybeDirectory(projectRoot, assertion.file)).text
    for (const needle of assertion.contains ?? []) {
      expectNeedle(content, needle, `${item.name} ${assertion.file} should contain ${String(needle)}`)
    }
    for (const needle of assertion.notContains ?? []) {
      if (typeof needle === 'string') {
        expect(content, `${item.name} ${assertion.file} should not contain ${needle}`).not.toContain(needle)
      }
      else {
        expect(content, `${item.name} ${assertion.file} should not match ${String(needle)}`).not.toMatch(needle)
      }
    }
  }

  const combined = `${styles}\n${texts}`
  for (const needle of item.notContains ?? []) {
    if (typeof needle === 'string') {
      expect(combined, `${item.name} output should not contain ${needle}`).not.toContain(needle)
    }
    else {
      expect(combined, `${item.name} output should not match ${String(needle)}`).not.toMatch(needle)
    }
  }
}
