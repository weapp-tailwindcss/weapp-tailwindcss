import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { WeappTailwindcss } from '../packages/weapp-tailwindcss/src/bundlers/vite'
import weappTailwindcssPostcss from '../packages/weapp-tailwindcss/src/postcss'

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

async function writeSharedSources(root: string) {
  const pageFile = path.join(root, 'src/pages/index.ts')
  const ignoredFile = path.join(root, 'src/apis/client.ts')
  await mkdir(path.dirname(pageFile), { recursive: true })
  await mkdir(path.dirname(ignoredFile), { recursive: true })
  await writeFile(pageFile, 'export const pageClass = "bg-[#112233] w-[100px]"', 'utf8')
  await writeFile(ignoredFile, 'export const apiClass = "text-[77rpx] bg-[#445566]"', 'utf8')
  return {
    ignoredFile,
    pageFile,
  }
}

async function readBuiltCss(root: string) {
  const dist = path.join(root, 'dist')
  const cssFiles: string[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(file)
        return
      }
      if (entry.isFile() && file.endsWith('.css')) {
        cssFiles.push(file)
      }
    }))
  }

  await walk(dist)
  expect(cssFiles.length).toBeGreaterThan(0)
  return (await Promise.all(cssFiles.map(file => readFile(file, 'utf8')))).join('\n')
}

async function resolvePathForCompare(file: string) {
  try {
    return await realpath(file)
  }
  catch {
    return path.resolve(file)
  }
}

async function collectDependencyFilesForCompare(messages: postcss.Result['messages']) {
  const files = await Promise.all(messages
    .filter(message => message.type === 'dependency' && typeof message.file === 'string')
    .map(message => resolvePathForCompare(message.file)))
  return new Set(files)
}

describe('source negation e2e', () => {
  it('honors Tailwind v4 @source not through the PostCSS generator', async () => {
    const project = await createTempProject('weapp-tw-e2e-postcss-v4-not-')
    try {
      const { ignoredFile, pageFile } = await writeSharedSources(project.root)
      await linkTailwindV4(project.root)

      const result = await postcss([
        weappTailwindcssPostcss({
          packageName: 'tailwindcss',
          version: 4,
        }),
      ]).process([
        '@theme default { --color-blue-500: #3b82f6; }',
        '@source "./src";',
        '@source not "./src/apis/**";',
        '@tailwind utilities;',
      ].join('\n'), {
        from: path.join(project.root, 'app.css'),
      })

      expect(result.css).toContain('.bg-_b_h112233_B')
      expect(result.css).toContain('.w-_b100px_B')
      expect(result.css).not.toContain('.text-_b77rpx_B')
      expect(result.css).not.toContain('.bg-_b_h445566_B')
      const dependencyFiles = await collectDependencyFilesForCompare(result.messages)
      expect(dependencyFiles).toContain(await resolvePathForCompare(pageFile))
      expect(dependencyFiles).not.toContain(await resolvePathForCompare(ignoredFile))
    }
    finally {
      await project.cleanup()
    }
  })

  it('honors Tailwind v4 @source not through a real Vite generator build', async () => {
    const project = await createTempProject('weapp-tw-e2e-vite-v4-not-')
    try {
      await writeSharedSources(project.root)
      await linkTailwindV4(project.root)
      await writeFile(path.join(project.root, 'src/app.css'), [
        '@import "tailwindcss" source(none);',
        '@source "./";',
        '@source not "./apis/**";',
        '.probe { @apply w-[100px]; }',
      ].join('\n'), 'utf8')
      await writeFile(path.join(project.root, 'src/main.ts'), 'import "./app.css"; import "./apis/client"; console.log("bg-[#112233] w-[100px]");', 'utf8')

      await build({
        build: {
          emptyOutDir: true,
          outDir: path.join(project.root, 'dist'),
          rollupOptions: {
            input: path.join(project.root, 'src/main.ts'),
          },
        },
        configFile: false,
        logLevel: 'silent',
        plugins: [
          WeappTailwindcss({
            cssEntries: [path.join(project.root, 'src/app.css')],
            tailwindcss: {
              packageName: 'tailwindcss',
              version: 4,
              v4: {
                cssEntries: [path.join(project.root, 'src/app.css')],
              },
            },
            tailwindcssBasedir: project.root,
          })!,
        ].flat(),
        root: project.root,
      })

      const css = await readBuiltCss(project.root)
      expect(css).toContain('.probe')
      expect(css).toMatch(/width:\s*100px/)
      expect(css).not.toContain('.text-_b77rpx_B')
      expect(css).not.toContain('.bg-_b_h445566_B')
    }
    finally {
      await project.cleanup()
    }
  })
})
