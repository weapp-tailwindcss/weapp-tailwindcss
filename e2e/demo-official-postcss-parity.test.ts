import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import fg from 'fast-glob'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

interface DemoParityCase {
  name: string
  project: string
  script: string
  outputDir: string
  env?: Record<string, string> | undefined
  skip?: string | undefined
}

interface CssSnapshot {
  file: string
  css: string
}

const repoRoot = path.resolve(__dirname, '..')
const STYLE_OUTPUT_PATTERN = '**/*.{wxss,acss,ttss,qss,jxss,css}'
const parityEnv = 'WEAPP_TW_OFFICIAL_POSTCSS_PARITY'

const cases: DemoParityCase[] = [
  {
    name: 'weapp-vite-tailwindcss-v4 weapp',
    project: 'weapp-vite-tailwindcss-v4',
    script: 'build',
    outputDir: 'dist',
    skip: 'weapp-vite >=6.24 prunes the external generator plugin; built-in managed Tailwind parity is covered by the framework static suite',
  },
  {
    name: 'mpx-tailwindcss-v4 wx',
    project: 'mpx-tailwindcss-v4',
    script: 'build',
    outputDir: 'dist/wx',
  },
  {
    name: 'uni-app-vite-tailwindcss-v4 mp-weixin',
    project: 'uni-app-vite-tailwindcss-v4',
    script: 'build:mp-weixin',
    outputDir: 'dist/build/mp-weixin',
    skip: 'uni-app Vite emits no comparable style asset in official parity mode yet',
  },
  {
    name: 'uni-app-vite-tailwindcss-v4 mp-alipay',
    project: 'uni-app-vite-tailwindcss-v4',
    script: 'build:mp-alipay',
    outputDir: 'dist/build/mp-alipay',
    skip: 'uni-app Vite official parity still conflicts with platform PostCSS import ordering',
  },
  {
    name: 'taro-vite-react-tailwindcss-v4 weapp',
    project: 'taro-vite-react-tailwindcss-v4',
    script: 'build:weapp',
    outputDir: 'dist',
    skip: 'Taro Vite emits no comparable style asset in official parity mode yet',
  },
  {
    name: 'taro-vite-react-tailwindcss-v4 alipay',
    project: 'taro-vite-react-tailwindcss-v4',
    script: 'build:alipay',
    outputDir: 'dist',
    skip: 'Taro Vite non-WeChat official parity needs separate output handling',
  },
  {
    name: 'taro-webpack-react-tailwindcss-v4 weapp',
    project: 'taro-webpack-react-tailwindcss-v4',
    script: 'build:weapp',
    outputDir: 'dist',
    skip: 'Taro Webpack emits no comparable style asset in official parity mode yet',
  },
  {
    name: 'gulp-tailwindcss-v4 weapp',
    project: 'gulp-tailwindcss-v4',
    script: 'build',
    outputDir: 'dist',
  },
]

function projectRoot(project: string) {
  return path.join(repoRoot, 'demo', project)
}

function packageName(project: string) {
  return `@weapp-tailwindcss-demo/${project}`
}

function normalizeCss(css: string) {
  const withoutNonSemanticComments = css
    .replace(/\n\s*@media\s+source\([^)]*\)\s*\{\s*$/, '')
    .replace(/\/\*# sourceMappingURL=.*?\*\//g, '')
    .replace(/\/\*! tailwindcss [\s\S]*?\*\//g, '')
    .replace(/\/\*!\s*weapp-tailwindcss[\s\S]*?\*\//g, '')
    .replace(/\/\* weapp-tailwindcss [\s\S]*?\*\//g, '')

  const root = postcss.parse(withoutNonSemanticComments)
  root.walkComments(comment => comment.remove())
  root.walk((node) => {
    node.raws.before = ''
    node.raws.after = ''
    if ('between' in node.raws) {
      node.raws.between = node.type === 'decl' ? ':' : ''
    }
    if (node.type === 'decl') {
      node.raws.important = ' !important'
    }
  })
  return root.toString().trim()
}

function normalizeSelector(selector: string) {
  return selector
    .replace(/:not\(#\\#\)/g, '')
    .replace(/\s+/g, ' ')
    .split(',')
    .map(item => item.trim())
    .sort()
    .join(',')
    .replace(/^:host,page,\.tw-root,wx-root-portal-content$/, '.tw-root,:host,page,wx-root-portal-content')
    .replace(/^page,\.tw-root,wx-root-portal-content,:host$/, '.tw-root,:host,page,wx-root-portal-content')
    .trim()
}

function normalizeValue(value: string) {
  return value
    .replace(/\s+in\s+oklab\b/g, '')
    .replace(/var\((--tw-[\w-]+),\s+\)/g, 'var($1)')
    .replace(/\brgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g, (_all, red: string, green: string, blue: string) => {
      return `#${[red, green, blue].map(item => Number(item).toString(16).padStart(2, '0')).join('')}`
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalizeDeclarations(declarations: postcss.Declaration[]) {
  const byProp = new Map<string, string[]>()
  const unprefixedProps = new Set(declarations.map(decl => decl.prop.replace(/^-webkit-/, '')))
  for (const decl of declarations) {
    if (decl.prop.startsWith('-webkit-') && unprefixedProps.has(decl.prop.replace(/^-webkit-/, ''))) {
      continue
    }
    const value = normalizeValue(decl.value)
    const signature = `${value}${decl.important ? '!important' : ''}`
    const values = byProp.get(decl.prop) ?? []
    values.push(signature)
    byProp.set(decl.prop, values)
  }

  const signatures: string[] = []
  for (const [prop, values] of byProp) {
    const unique = [...new Set(values)]
    const preferred = prop.startsWith('--')
      ? unique
      : unique.some(value => value.includes('var('))
        ? unique.filter(value => value.includes('var('))
        : unique
    for (const value of preferred) {
      signatures.push(`${prop}:${value}`)
    }
  }
  return signatures
}

function collectComparableRuleSignatures(snapshots: CssSnapshot[]) {
  const signatures = new Set<string>()
  for (const snapshot of snapshots) {
    const root = postcss.parse(snapshot.css)
    root.walkRules((rule) => {
      if (!rule.selector.includes('.')) {
        return
      }
      const selector = normalizeSelector(rule.selector)
      if (selector === '.tw-root,:host,page,wx-root-portal-content') {
        return
      }
      const declarations = canonicalizeDeclarations(rule.nodes.filter((node): node is postcss.Declaration => node.type === 'decl'))
      if (declarations.length === 0) {
        return
      }
      const parentNames: string[] = []
      let parent = rule.parent
      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule' && parent.name !== 'layer') {
          parentNames.unshift(`@${parent.name} ${parent.params}`)
        }
        parent = parent.parent
      }
      signatures.add([
        ...parentNames,
        selector,
        declarations.join(';'),
      ].join('|'))
    })
  }
  return [...signatures].sort()
}

function compareRuleSignatures(actual: string[], expected: string[]) {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  const missing = expected.filter(item => !actualSet.has(item))
  const extra = actual.filter(item => !expectedSet.has(item))
  const tolerance = Math.max(1, Math.ceil(expected.length * 0.08))
  expect(missing.length, `missing comparable rules:\n${missing.join('\n')}`).toBeLessThanOrEqual(tolerance)
  expect(extra.length, `extra comparable rules:\n${extra.join('\n')}`).toBeLessThanOrEqual(tolerance)
}

async function clearOutput(item: DemoParityCase) {
  await fs.rm(path.join(projectRoot(item.project), item.outputDir), {
    force: true,
    recursive: true,
  })
}

async function buildDemo(item: DemoParityCase, mode: 'generator' | 'official-postcss') {
  await clearOutput(item)
  const env = {
    ...process.env,
    ...(item.env ?? {}),
    [parityEnv]: mode === 'official-postcss' ? '1' : '0',
  }
  await execa('pnpm', ['--filter', packageName(item.project), 'run', item.script], {
    cwd: repoRoot,
    env,
    stdio: 'pipe',
  })
}

async function collectCssSnapshots(item: DemoParityCase): Promise<CssSnapshot[]> {
  const outputRoot = path.join(projectRoot(item.project), item.outputDir)
  const files = await fg(STYLE_OUTPUT_PATTERN, {
    cwd: outputRoot,
    dot: false,
    onlyFiles: true,
  })
  const snapshots = await Promise.all(files.sort().map(async file => ({
    file,
    css: normalizeCss(await fs.readFile(path.join(outputRoot, file), 'utf8')),
  })))
  return snapshots.filter(snapshot => snapshot.css.length > 0)
}

describe('demo official PostCSS parity', () => {
  for (const item of cases) {
    const testCase = item.skip ? it.skip : it
    testCase(`${item.name} matches weapp generator output`, async () => {
      await buildDemo(item, 'generator')
      const generatorSnapshots = await collectCssSnapshots(item)

      await buildDemo(item, 'official-postcss')
      const officialSnapshots = await collectCssSnapshots(item)

      expect(officialSnapshots.length, `${item.name} official PostCSS css output should not be empty`).toBeGreaterThan(0)
      compareRuleSignatures(
        collectComparableRuleSignatures(officialSnapshots),
        collectComparableRuleSignatures(generatorSnapshots),
      )
    })
  }
})
