import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { WeappTailwindcss } from '../packages/weapp-tailwindcss/src/bundlers/vite'

const require = createRequire(import.meta.url)
const tailwindcssV4Root = path.dirname(require.resolve('tailwindcss/package.json'))

async function createTempProject(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true })
    },
  }
}

async function linkTailwindV4(root: string) {
  const nodeModulesDir = path.join(root, 'node_modules')
  await mkdir(nodeModulesDir, { recursive: true })
  await symlink(tailwindcssV4Root, path.join(nodeModulesDir, 'tailwindcss'), 'dir')
}

async function walkFiles(root: string, predicate: (file: string) => boolean) {
  const files: string[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(file)
        return
      }
      if (entry.isFile() && predicate(file)) {
        files.push(file)
      }
    }))
  }

  await walk(root)
  return files
}

async function readBuiltFiles(root: string, extension: string) {
  const dist = path.join(root, 'dist')
  const files = await walkFiles(dist, file => file.endsWith(extension))
  return (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n')
}

async function writeViteSources(root: string, main: string, css: string) {
  const src = path.join(root, 'src')
  await mkdir(src, { recursive: true })
  await writeFile(path.join(src, 'main.ts'), main, 'utf8')
  await writeFile(path.join(src, 'app.css'), css, 'utf8')
}

async function buildViteProject(root: string) {
  const cssEntry = path.join(root, 'src/app.css')
  await build({
    build: {
      emptyOutDir: true,
      minify: false,
      outDir: path.join(root, 'dist'),
      rollupOptions: {
        input: path.join(root, 'src/main.ts'),
      },
    },
    configFile: false,
    logLevel: 'silent',
    plugins: [
      WeappTailwindcss({
        cssEntries: [cssEntry],
        generator: {
          target: 'weapp',
        },
        tailwindcss: {
          packageName: 'tailwindcss',
          version: 4,
          v4: {
            cssEntries: [cssEntry],
          },
        },
        tailwindcssBasedir: root,
      })!,
    ].flat(),
    root,
  })
}

describe('issue #903 and #948 regressions', () => {
  it('keeps polluted API, route and asset paths unchanged in a real Vite build', async () => {
    const project = await createTempProject('weapp-tw-e2e-issue-903-')
    try {
      await linkTailwindV4(project.root)
      await writeViteSources(
        project.root,
        [
          'import "./app.css"',
          'const className = "text-[12px] w-1/2"',
          'const api = "order/get_order_amount"',
          'const route = "pages/order/detail"',
          'const asset = "static/icon-home.svg"',
          'console.log(className, api, route, asset)',
        ].join('\n'),
        [
          '@import "tailwindcss" source(none);',
          '@source "./main.ts";',
        ].join('\n'),
      )

      await buildViteProject(project.root)

      const js = await readBuiltFiles(project.root, '.js')
      expect(js).toContain('text-_b12px_B w-1_f2')
      expect(js).toContain('order/get_order_amount')
      expect(js).toContain('pages/order/detail')
      expect(js).toContain('static/icon-home.svg')
      expect(js).not.toContain('order_fget_order_amount')
      expect(js).not.toContain('pages_forder_fdetail')
      expect(js).not.toContain('static_ficon-home_dsvg')
    }
    finally {
      await project.cleanup()
    }
  })

  it('requires the app entry to import CSS even when cssEntries points at the Tailwind entry', async () => {
    const css = [
      '@import "tailwindcss" source(none);',
      '@source "./main.ts";',
      '.probe { @apply w-[100px]; }',
    ].join('\n')

    const withoutImport = await createTempProject('weapp-tw-e2e-issue-948-missing-import-')
    try {
      await linkTailwindV4(withoutImport.root)
      await writeViteSources(withoutImport.root, 'console.log("w-[100px]")', css)
      await buildViteProject(withoutImport.root)

      const builtCss = await readBuiltFiles(withoutImport.root, '.css')
      expect(builtCss).not.toContain('.probe')
      expect(builtCss).not.toContain('width: 100px')
    }
    finally {
      await withoutImport.cleanup()
    }

    const withImport = await createTempProject('weapp-tw-e2e-issue-948-with-import-')
    try {
      await linkTailwindV4(withImport.root)
      await writeViteSources(withImport.root, 'import "./app.css"; console.log("w-[100px]")', css)
      await buildViteProject(withImport.root)

      const builtCss = await readBuiltFiles(withImport.root, '.css')
      expect(builtCss).toContain('.probe')
      expect(builtCss).toContain('width: 100px')
    }
    finally {
      await withImport.cleanup()
    }
  })
})
