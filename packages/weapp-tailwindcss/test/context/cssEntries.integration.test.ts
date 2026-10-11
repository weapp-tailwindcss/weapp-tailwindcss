import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { escape } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { getCompilerContext } from '@/context'
import { collectRuntimeClassSet } from '@/tailwindcss/runtime'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(__dirname, '../../../..')
const tailwindcss4Root = path.dirname(require.resolve('tailwindcss/package.json'))
const uniAppViteV4CssEntries = (projectRoot: string) => [
  path.resolve(projectRoot, 'src/main.css'),
  path.resolve(projectRoot, 'src/sub-normal/pages/index.css'),
  path.resolve(projectRoot, 'src/sub-independent/pages/index.css'),
]
const uniAppViteV4DemoRoot = path.resolve(repoRoot, 'demo/uni-app-vite-tailwindcss-v4')
const HIGH_RISK_ARBITRARY_ADD_TOKENS = [
  'bg-[#000]',
  'px-[432.43px]',
  'w-[calc(100%_-_12px)]',
  'bg-[rgb(12,34,56)]',
  'bg-[var(--primary-color-hex)]',
  'text-[14px]',
] as const

async function createUniAppViteV4DemoCopy() {
  const projectRoot = await fs.mkdtemp(path.join(repoRoot, 'demo/.tmp-weapp-tw-uni-vite-v4-'))
  await fs.cp(uniAppViteV4DemoRoot, projectRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(uniAppViteV4DemoRoot, source)
      const parts = relative.split(path.sep)
      return !parts.some(part => part === 'node_modules' || part === 'dist' || part === '.turbo' || part === '.hbuilderx')
    },
  })
  await fs.symlink(path.join(uniAppViteV4DemoRoot, 'node_modules'), path.join(projectRoot, 'node_modules'), 'dir')
  return projectRoot
}
const HIGH_RISK_ARBITRARY_MODIFY_TOKENS = [
  'bg-[#0f0]',
  'px-[256.25px]',
  'w-[calc(100%_-_24px)]',
  'bg-[rgb(98,12,45)]',
  'bg-[var(--primary-color-bg)]',
  'text-[22px]',
] as const

function appendScriptLiteralProbe(source: string, tokens: readonly string[]) {
  const probe = [
    '',
    `const __twArbitraryHotRefresh = ref(${JSON.stringify([...tokens])})`,
    '',
  ].join('\n')
  return source.replace('</script>', `${probe}</script>`)
}

async function createTailwindV4Fixture() {
  const projectRoot = await fs.mkdtemp(path.join(tmpdir(), 'weapp-tw-css-entries-v4-'))
  const sourceRoot = path.join(projectRoot, 'src')
  const nodeModulesRoot = path.join(projectRoot, 'node_modules')
  await fs.mkdir(sourceRoot, { recursive: true })
  await fs.mkdir(nodeModulesRoot, { recursive: true })
  await fs.symlink(tailwindcss4Root, path.join(nodeModulesRoot, 'tailwindcss'), 'dir')
  await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'tailwind-v4-fixture',
    private: true,
    devDependencies: {
      tailwindcss: 'catalog:tailwindcss4',
    },
  }, null, 2), 'utf8')
  await fs.writeFile(path.join(sourceRoot, 'index.html'), [
    '<!doctype html>',
    '<html>',
    '  <body>',
    '    <div class="bg-[#00aa55]">',
    '      fixture',
    '    </div>',
    '  </body>',
    '</html>',
  ].join('\n'), 'utf8')
  const cssEntry = path.join(sourceRoot, 'main.css')
  await fs.writeFile(cssEntry, '@import "tailwindcss";\n', 'utf8')
  return {
    cssEntry,
    projectRoot,
  }
}

describe('cssEntries integration', () => {
  it('collects class names from nested css entries and rewrites arbitrary classes', async () => {
    const { projectRoot, cssEntry } = await createTailwindV4Fixture()

    try {
      const ctx = getCompilerContext({
        tailwindcssBasedir: projectRoot,
        cssEntries: [cssEntry],
      })

      expect(ctx.tailwindRuntime.majorVersion).toBe(4)
      expect(ctx.tailwindRuntime.packageInfo?.name).toBe('tailwindcss')

      const runtimeSet = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
      expect(runtimeSet.size).toBeGreaterThan(0)
      expect(runtimeSet.has('bg-[#00aa55]')).toBe(true)
      const source = 'const cls = \'bg-[#00aa55]\''
      const result = ctx.jsHandler(source, runtimeSet)
      const expectedClass = escape('bg-[#00aa55]')

      expect(result.code).toContain(expectedClass)
      expect(result.code).not.toContain('bg-[#00aa55]')
    }
    finally {
      await fs.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('refreshes script arbitrary values for uni-app-vite-tailwindcss-v4', async () => {
    const projectRoot = await createUniAppViteV4DemoCopy()
    const sourceFile = path.join(projectRoot, 'src/pages/index/index.vue')
    const original = await fs.readFile(sourceFile, 'utf8')
    const previousToken = 'bg-[#123456] shadow-blue-100'
    const nextToken = 'bg-[#4545AB] shadow-blue-100'
    const originalWithPreviousToken = appendScriptLiteralProbe(original, [previousToken])

    expect(original.includes(nextToken)).toBe(false)
    await fs.writeFile(sourceFile, originalWithPreviousToken, 'utf8')

    const ctx = getCompilerContext({
      tailwindcssBasedir: projectRoot,
      appType: 'uni-app-vite',
      cssEntries: uniAppViteV4CssEntries(projectRoot),
    })

    const baseline = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
    expect(baseline.has('bg-[#123456]')).toBe(true)
    expect(baseline.has('bg-[#4545AB]')).toBe(false)
    expect(baseline.has('bg-[#4545ab]')).toBe(false)

    await fs.writeFile(sourceFile, originalWithPreviousToken.replace(previousToken, nextToken), 'utf8')

    try {
      await ctx.refreshTailwindcssRuntime({ clearCache: true })

      const refreshed = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
      expect(refreshed.has('bg-[#4545AB]') || refreshed.has('bg-[#4545ab]')).toBe(true)

      const source = `import { ref } from 'vue'\nconst cardsColor = ref(['${nextToken}'])`
      const result = ctx.jsHandler(source, refreshed)
      expect(result.code).toMatch(/bg-_b_h4545(?:AB|ab)_B/)
      expect(result.code).not.toContain(`'bg-[#4545AB] shadow-blue-100'`)
    }
    finally {
      await fs.writeFile(sourceFile, original, 'utf8')
      await ctx.refreshTailwindcssRuntime({ clearCache: true })
      await fs.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('keeps shorthand hex script classes refreshable for uni-app-vite-tailwindcss-v4', async () => {
    const projectRoot = await createUniAppViteV4DemoCopy()
    const sourceFile = path.join(projectRoot, 'src/pages/index/index.vue')
    const original = await fs.readFile(sourceFile, 'utf8')
    const previousToken = '\'bg-[#999999]\':true'
    const nextToken = '\'bg-[#f00]\':true'
    const originalWithPreviousToken = original.replace('</script>', `\nconst __twShortHexHotRefresh = ref({ ${previousToken} })\n</script>`)

    expect(original.includes(nextToken)).toBe(false)
    await fs.writeFile(sourceFile, originalWithPreviousToken, 'utf8')

    const ctx = getCompilerContext({
      tailwindcssBasedir: projectRoot,
      appType: 'uni-app-vite',
      cssEntries: uniAppViteV4CssEntries(projectRoot),
    })

    const baseline = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
    expect(baseline.has('bg-[#999999]')).toBe(true)
    expect(baseline.has('bg-[#f00]')).toBe(false)

    await fs.writeFile(sourceFile, originalWithPreviousToken.replace(previousToken, nextToken), 'utf8')

    try {
      await ctx.refreshTailwindcssRuntime({ clearCache: true })

      const refreshed = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
      expect(refreshed.has('bg-[#f00]')).toBe(true)

      const source = 'import { ref } from \'vue\'\nconst bgObj = ref({ \'bg-[#f00]\': true })'
      const result = ctx.jsHandler(source, refreshed)
      expect(result.code).toContain(escape('bg-[#f00]'))
      expect(result.code).not.toContain('bg-[#f00]')
    }
    finally {
      await fs.writeFile(sourceFile, original, 'utf8')
      await ctx.refreshTailwindcssRuntime({ clearCache: true })
      await fs.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('refreshes high-risk arbitrary script token families for uni-app-vite-tailwindcss-v4', async () => {
    const projectRoot = await createUniAppViteV4DemoCopy()
    const sourceFile = path.join(projectRoot, 'src/pages/index/index.vue')
    const original = await fs.readFile(sourceFile, 'utf8')

    const ctx = getCompilerContext({
      tailwindcssBasedir: projectRoot,
      appType: 'uni-app-vite',
      cssEntries: uniAppViteV4CssEntries(projectRoot),
    })


    await fs.writeFile(sourceFile, appendScriptLiteralProbe(original, HIGH_RISK_ARBITRARY_ADD_TOKENS), 'utf8')

    try {
      await ctx.refreshTailwindcssRuntime({ clearCache: true })

      const baseline = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
      for (const token of HIGH_RISK_ARBITRARY_ADD_TOKENS) {
        expect(baseline.has(token), `baseline should collect ${token}`).toBe(true)
      }

      const addedSource = `import { ref } from 'vue'\nconst cls = ref(${JSON.stringify([...HIGH_RISK_ARBITRARY_ADD_TOKENS])})`
      const addedResult = ctx.jsHandler(addedSource, baseline)
      for (const token of HIGH_RISK_ARBITRARY_ADD_TOKENS) {
        expect(addedResult.code).toContain(escape(token))
        expect(addedResult.code).not.toContain(token)
      }

      await fs.writeFile(sourceFile, appendScriptLiteralProbe(original, HIGH_RISK_ARBITRARY_MODIFY_TOKENS), 'utf8')
      await ctx.refreshTailwindcssRuntime({ clearCache: true })

      const refreshed = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
      for (const token of HIGH_RISK_ARBITRARY_MODIFY_TOKENS) {
        expect(refreshed.has(token), `refreshed should collect ${token}`).toBe(true)
      }

      const modifiedSource = `import { ref } from 'vue'\nconst cls = ref(${JSON.stringify([...HIGH_RISK_ARBITRARY_MODIFY_TOKENS])})`
      const modifiedResult = ctx.jsHandler(modifiedSource, refreshed)
      for (const token of HIGH_RISK_ARBITRARY_MODIFY_TOKENS) {
        expect(modifiedResult.code).toContain(escape(token))
        expect(modifiedResult.code).not.toContain(token)
      }
    }
    finally {
      await fs.writeFile(sourceFile, original, 'utf8')
      await ctx.refreshTailwindcssRuntime({ clearCache: true })
      await fs.rm(projectRoot, { recursive: true, force: true })
    }
  })
})
