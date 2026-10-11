import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { WeappTailwindcss } from '../packages/weapp-tailwindcss/src/bundlers/vite'

async function createTempProject() {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-oxc-fast-path-'))
  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true })
    },
  }
}

async function readBuiltJs(root: string) {
  const dist = path.join(root, 'dist')
  const jsFiles: string[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(file)
        return
      }
      if (entry.isFile() && file.endsWith('.js')) {
        jsFiles.push(file)
      }
    }))
  }

  await walk(dist)
  expect(jsFiles.length).toBeGreaterThan(0)
  return (await Promise.all(jsFiles.map(file => readFile(file, 'utf8')))).join('\n')
}

describe('OXC fast path e2e', () => {
  it('transforms script-origin class strings through a real Vite build', async () => {
    const project = await createTempProject()
    try {
      const srcDir = path.join(project.root, 'src')
      await mkdir(srcDir, { recursive: true })
      await writeFile(path.join(project.root, 'tailwind.config.js'), [
        'module.exports = {',
        '  content: ["./src/**/*.{ts,tsx,css}"],',
        '  corePlugins: { preflight: false },',
        '}',
      ].join('\n'), 'utf8')
      await writeFile(path.join(srcDir, 'app.css'), '@tailwind utilities;', 'utf8')
      await writeFile(path.join(srcDir, 'main.tsx'), [
        'import "./app.css"',
        'const item = { className: "w-[100px] bg-[red]", label: "not a class" }',
        'const dynamic = `h-[20px] ${' + 'item.label} mt-2`',
        'export const view = <view data-state={{ active: "px-[12px]" }} className={item.className}>{dynamic}</view>',
        'console.log(view)',
      ].join('\n'), 'utf8')

      await build({
        build: {
          emptyOutDir: true,
          minify: false,
          outDir: path.join(project.root, 'dist'),
          rollupOptions: {
            input: path.join(srcDir, 'main.tsx'),
          },
        },
        configFile: false,
        esbuild: {
          jsx: 'transform',
          jsxFactory: 'h',
          jsxFragment: 'Fragment',
        },
        logLevel: 'silent',
        plugins: [
          WeappTailwindcss({
            experimentalJsFastPath: 'oxc',
            generator: {
              target: 'weapp',
            },
            tailwindcss: {
              version: 3,
              config: path.join(project.root, 'tailwind.config.js'),
            },
            tailwindcssBasedir: project.root,
          })!,
        ].flat(),
        root: project.root,
      })

      const js = await readBuiltJs(project.root)
      expect(js).toContain('w-_b100px_B')
      expect(js).toContain('bg-_bred_B')
      expect(js).toContain('h-_b20px_B')
      expect(js).toContain('px-_b12px_B')
      expect(js).toContain('not a class')
    }
    finally {
      await project.cleanup()
    }
  })
})
