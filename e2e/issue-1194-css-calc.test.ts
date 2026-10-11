import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss'
import { execa } from 'execa'
import fg from 'fast-glob'
import { expect, it } from 'vitest'
import { resolveProjectBin } from './package-cli'

const demoRoot = path.resolve(__dirname, '../demo/uni-app-vite-tailwindcss-v4')

it('在真实 uni-app H5 产物中预计算指定的间距变量，并保留 Web CSS 语义', async () => {
  const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-tw-issue-1194-')))
  const root = path.join(temporary, 'project')
  try {
    await mkdir(root)
    // uni-app 保留符号链接路径，临时工程需要与 workspace 相同的间接依赖查找层。
    await symlink(path.resolve(__dirname, '../node_modules/.pnpm/node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const modules = path.join(root, 'node_modules')
    await mkdir(modules)
    for (const entry of await readdir(path.join(demoRoot, 'node_modules'), { withFileTypes: true })) {
      const name = entry.name
      if (name !== '@vue' && name !== '.bin' && (entry.isDirectory() || entry.isSymbolicLink())) {
        await symlink(path.join(demoRoot, 'node_modules', name), path.join(modules, name), process.platform === 'win32' ? 'junction' : 'dir')
      }
    }
    const demoRequire = createRequire(path.join(demoRoot, 'package.json'))
    const vueRequire = createRequire(demoRequire.resolve('vue/package.json'))
    const runtimeDom = vueRequire.resolve('@vue/runtime-dom/package.json')
    const runtimeRequire = createRequire(runtimeDom)
    // uni-app 从工程目录解析 Vue 内部依赖，保持这些依赖与 Vue 自身的版本一致。
    await symlink(path.dirname(path.dirname(runtimeDom)), path.join(modules, '@vue'), process.platform === 'win32' ? 'junction' : 'dir')
    const manifest = JSON.parse(await readFile(path.join(demoRoot, 'package.json'), 'utf8'))
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ ...manifest, name: 'issue-1194', scripts: {} }),
      'index.html': '<html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
      'vite.config.ts': `
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
export default defineConfig({
  plugins: [uni(), WeappTailwindcss({
    cssEntries: ['./src/tailwind.css'],
    rem2rpx: true,
    cssCalc: ['--spacing'],
  })],
  css: { postcss: { plugins: [] } },
  resolve: { alias: { '@vue/shared': ${JSON.stringify(runtimeRequire.resolve('@vue/shared/dist/shared.esm-bundler.js'))} } },
})
`,
      'src/main.ts': `
import { createSSRApp } from 'vue'
import App from './App.vue'
import './tailwind.css'
import './author.css'
export function createApp() { return { app: createSSRApp(App) } }
`,
      'src/App.vue': '<script>export default {}</script>',
      'src/manifest.json': JSON.stringify({ name: 'issue-1194', appid: '', versionName: '1.0.0', h5: {} }),
      'src/pages.json': JSON.stringify({ pages: [{ path: 'pages/index' }] }),
      'src/pages/index.vue': `
<template><view class="gap-2 p-2 mt-2 raw-btn">Issue 1194</view></template>
`,
      'src/author.css': `
.raw-btn { gap: calc(var(--spacing) * 2); }
.raw-btn:hover { margin-top: calc(var(--spacing) * 2); }
.unselected { width: calc(var(--other) * 2); }
`,
      'src/tailwind.css': `
@import 'tailwindcss' source(none);
@source './pages/index.vue';
@theme { --spacing: 0.25rem; }
:root { --other: 3px; }
`,
    }
    for (const [name, content] of Object.entries(files)) {
      const file = path.resolve(root, name)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    }
    const uniBin = await resolveProjectBin(root, '@dcloudio/vite-plugin-uni', 'uni')
    await execa(process.execPath, [uniBin, 'build'], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        UNI_PLATFORM: 'h5',
        UNI_INPUT_DIR: path.join(root, 'src'),
        UNI_OUTPUT_DIR: path.join(root, 'dist'),
      },
      timeout: 120_000,
    })
    const outputs = await fg('**/*.css', { cwd: path.join(root, 'dist'), absolute: true })
    expect(outputs.length).toBeGreaterThan(0)
    const css = (await Promise.all(outputs.sort().map(file => readFile(file, 'utf8')))).join('\n')
    expect(css).not.toMatch(/calc\(var\(--spacing\)/)
    expect(css).not.toMatch(/@(theme|tailwind|source)\b/)

    const selectors = new Set(['.gap-2', '.p-2', '.mt-2', '.raw-btn', '.raw-btn:hover', '.unselected'])
    const declarations: Record<string, Record<string, string>> = {}
    postcss.parse(css).walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (!selectors.has(selector)) {
          continue
        }
        const values = declarations[selector] ??= {}
        rule.walkDecls((decl) => {
          values[decl.prop] = decl.value
        })
      }
    })
    expect(declarations['.gap-2']?.gap).toMatch(/^0?\.5rem$/)
    expect(declarations['.p-2']?.padding).toMatch(/^0?\.5rem$/)
    expect(declarations['.mt-2']?.['margin-top']).toMatch(/^0?\.5rem$/)
    expect(declarations['.raw-btn']?.gap).toMatch(/^0?\.5rem$/)
    expect(declarations['.raw-btn:hover']?.['margin-top']).toMatch(/^0?\.5rem$/)
    expect(declarations['.unselected']?.width).toMatch(/var\(--other\)/)
    expect(css).toMatch(/:root[^{}]*\{[^{}]*--spacing:\s*0?\.25rem/)
    await expect(`${JSON.stringify(declarations, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1194/h5-css.json')
  }
  finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}, 150_000)
