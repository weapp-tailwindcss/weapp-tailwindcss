import fs from 'node:fs/promises'
import { execa } from 'execa'
import fg from 'fast-glob'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { CANONICAL_TEMPLATE_CASES } from './canonicalTemplateMatrix'
import { readTemplatePageConfigs } from './template-ide/config'
import { isTemplateVersionCompatible, TEMPLATE_PACKAGE_MANAGER } from './templateContract'

const repoRoot = path.resolve(__dirname, '..')
const templatesRoot = path.resolve(repoRoot, 'templates')
const rawTailwindDirectiveRE = /(?:^|[;{}\n])\s*@(import\s+["']tailwindcss|tailwind|apply|theme|source)\b/
const transformedClassMarkerRE = /_b[\w-]+_B/
const styleFileRE = /\.(?:css|wxss|acss|jxss|qss|ttss)$/i
const textFileRE = /\.(?:html|js|json|ts|tsx|vue|wxml)$/i

function shouldRunCase(name: string) {
  const filter = process.env['E2E_CANONICAL_TEMPLATE_CASE']
  return !filter || new RegExp(filter).test(name)
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

async function readTargets(root: string, targets: readonly string[], fileRE: RegExp) {
  const files: string[] = []
  for (const target of targets) {
    const absolute = path.resolve(root, target)
    if (!await pathExists(absolute)) {
      continue
    }
    const stat = await fs.stat(absolute)
    if (stat.isFile()) {
      if (fileRE.test(absolute)) {
        files.push(absolute)
      }
      continue
    }
    files.push(...await fg('**/*', { absolute: true, cwd: absolute, onlyFiles: true }))
  }
  const readable = files.filter(file => fileRE.test(file)).sort()
  return (await Promise.all(readable.map(file => fs.readFile(file, 'utf8')))).join('\n')
}

async function runPnpm(cwd: string, args: string[]) {
  await execa('pnpm', args, {
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
    stdio: process.env['E2E_DEBUG_BUILD'] === '1' ? 'inherit' : 'pipe',
  })
}

async function clearBuildState(root: string) {
  await fs.rm(path.resolve(root, 'dist'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'unpackage'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'node_modules/.cache'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'node_modules/.vite'), { recursive: true, force: true })
}

describe('canonical template build smoke', () => {
  it('keeps every canonical template directory represented in the matrix', async () => {
    const packageFiles = await fg('*/package.json', { cwd: templatesRoot, onlyFiles: true })
    const canonicalNames = new Set(CANONICAL_TEMPLATE_CASES.map(item => item.template))
    for (const name of canonicalNames) {
      expect(packageFiles).toContain(`${name}/package.json`)
    }
  })

  it.each(CANONICAL_TEMPLATE_CASES.filter(item => shouldRunCase(item.name)))('$name', async (item) => {
    const root = path.resolve(templatesRoot, item.template)
    const pkg = JSON.parse(await fs.readFile(path.resolve(root, 'package.json'), 'utf8')) as {
      packageManager?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(pkg.packageManager, `${item.name} should pin pnpm`).toBe(TEMPLATE_PACKAGE_MANAGER)
    expect(deps.tailwindcss, `${item.name} should use Tailwind CSS v4`).toMatch(/^\^4\./)
    expect(isTemplateVersionCompatible(deps['weapp-tailwindcss']), `${item.name} should accept the current stable version`).toBe(true)
    expect(deps['@tailwindcss/postcss'], `${item.name} must not register the official PostCSS generator`).toBeUndefined()
    expect(deps['@tailwindcss/vite'], `${item.name} must not register the official Vite generator`).toBeUndefined()
    const cssEntry = await fs.readFile(path.resolve(root, item.cssEntry), 'utf8')
    expect(cssEntry).toContain('@import "tailwindcss"')
    expect(cssEntry).toContain('@source')

    if (process.env['E2E_CANONICAL_TEMPLATE_SKIP_INSTALL'] !== '1') {
      await runPnpm(root, ['install', '--frozen-lockfile'])
    }
    if (process.env['E2E_CANONICAL_TEMPLATE_USE_LOCAL'] === '1' && item.kind === 'web') {
      await runPnpm(root, ['link', path.resolve(repoRoot, 'packages/weapp-tailwindcss')])
    }
    if (process.env['E2E_CANONICAL_TEMPLATE_SKIP_BUILD'] === '1') {
      return
    }

    await clearBuildState(root)
    await runPnpm(root, item.buildCommand)

    for (const file of item.requiredFiles) {
      expect(await pathExists(path.resolve(root, file)), `${item.name} should emit ${file}`).toBe(true)
    }

    if (item.kind === 'mini-program') {
      await readTemplatePageConfigs(path.resolve(root, item.outputDir))
    }
    if ('snapshotFiles' in item) {
      for (const file of item.snapshotFiles) {
        await expect(await fs.readFile(path.resolve(root, item.outputDir, file), 'utf8')).toMatchFileSnapshot(path.resolve(__dirname, '__snapshots__', 'canonical-templates', item.template, file))
      }
    }

    const styles = await readTargets(root, item.styleTargets, styleFileRE)
    expect(styles.length, `${item.name} should emit readable styles`).toBeGreaterThan(0)
    expect(styles, `${item.name} styles should not contain raw Tailwind directives`).not.toMatch(rawTailwindDirectiveRE)

    const texts = await readTargets(root, item.textTargets, textFileRE)
    if (item.kind === 'web') {
      expect(`${styles}\n${texts}`, `${item.name} should keep browser class output`).not.toMatch(transformedClassMarkerRE)
    }
    else {
      expect(`${styles}\n${texts}`, `${item.name} should include transformed class output`).toMatch(transformedClassMarkerRE)
    }
  }, 1_200_000)
})
