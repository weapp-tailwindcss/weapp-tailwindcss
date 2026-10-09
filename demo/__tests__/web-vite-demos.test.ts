import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const webDemoProjects = [
  'react-vite-tailwindcss-v4',
  'vue-vite-tailwindcss-v4',
  'vue-vite7-tailwindcss-v4',
  'nuxt-vite-tailwindcss-v4',
] as const

async function readDemoFile(relativePath: string) {
  return readFile(path.resolve(demoRoot, relativePath), 'utf8')
}

describe('demo/web vite matrix', () => {
  it('keeps every web demo package pinned to the latest Vite/React/Vue catalog entries', async () => {
    const packages = await Promise.all(
      webDemoProjects.map(project => readDemoFile(`web/${project}/package.json`).then(JSON.parse)),
    ) as Array<{
      name: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>

    expect(packages.map(pkg => pkg.name)).toEqual([
      '@weapp-tailwindcss-demo/web-react-vite-tailwindcss-v4',
      '@weapp-tailwindcss-demo/web-vue-vite-tailwindcss-v4',
      '@weapp-tailwindcss-demo/web-vue-vite7-tailwindcss-v4',
      '@weapp-tailwindcss-demo/web-nuxt-vite-tailwindcss-v4',
    ])

    expect(packages.every(pkg => pkg.scripts?.build)).toBe(true)
    expect(packages[0]?.devDependencies?.vite).toBe('catalog:vite8')
    expect(packages[1]?.devDependencies?.vite).toBe('catalog:vite8')
    expect(packages[2]?.devDependencies?.vite).toBe('catalog:vite724')
    expect(packages[0]?.devDependencies?.['@vitejs/plugin-react']).toBe('catalog:vitePluginReact6')
    expect(packages[1]?.devDependencies?.['@vitejs/plugin-vue']).toBe('catalog:vitePluginVue6')
    expect(packages[2]?.devDependencies?.['@vitejs/plugin-vue']).toBe('catalog:vitePluginVue6')
    expect(packages[0]?.dependencies?.react).toBe('catalog:react19')
    expect(packages[1]?.dependencies?.vue).toBe('catalog:vue3')
    expect(packages[2]?.dependencies?.vue).toBe('catalog:vue3')
    expect(packages[3]?.dependencies?.nuxt).toBe('4.6.0')
    expect(packages.every(pkg => pkg.devDependencies?.tailwindcss === 'catalog:tailwindcss4')).toBe(true)
    for (const pkg of packages) {
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      }
      expect(deps['@tailwindcss/vite']).toBeUndefined()
      expect(deps['@tailwindcss/postcss']).toBeUndefined()
    }
  })

  it('keeps the shared target switch defaulting to web while allowing weapp opt-in', async () => {
    const helper = await readDemoFile('web/shared/vite-target.ts')

    expect(helper).toContain(`createWebDemoWeappTailwindcssPlugins(projectRoot: string)`)
    expect(helper).toContain(`tailwindcssBasedir: projectRoot`)
    expect(helper).toContain(`cssEntries: [`)
    expect(helper).toContain(`resolve(projectRoot, 'src/style.css')`)
    expect(helper).toContain(`return target === 'weapp' ? 'weapp' : 'web'`)
    expect(helper).toContain(`generator: {`)
    expect(helper).toContain(`target,`)
    expect(helper).toContain(`rem2rpx: false`)
  })

  it('keeps helper-based Vite web demos passing an absolute project root into the shared plugin helper', async () => {
    const configs = await Promise.all([
      readDemoFile('web/react-vite-tailwindcss-v4/vite.config.ts'),
      readDemoFile('web/vue-vite-tailwindcss-v4/vite.config.ts'),
    ])

    for (const config of configs) {
      expect(config).toContain(`fileURLToPath(import.meta.url)`)
      expect(config).toContain(`createWebDemoWeappTailwindcssPlugins(projectRoot)`)
      expect(config).not.toContain(`createWebDemoWeappTailwindcssPlugins()`)
    }
  })

  it('keeps directly configured Vite web demos on absolute CSS entry paths', async () => {
    const configs = await Promise.all([
      readDemoFile('web/vue-vite7-tailwindcss-v4/vite.config.ts'),
      readDemoFile('web/nuxt-vite-tailwindcss-v4/nuxt.config.ts'),
    ])

    for (const config of configs) {
      expect(config).toContain(`fileURLToPath(import.meta.url)`)
      expect(config).toContain(`tailwindcssBasedir: projectRoot`)
      expect(config).toContain(`cssEntries: [`)
      expect(config).toContain(`resolve(projectRoot,`)
      expect(config).not.toContain(`resolve(process.cwd()`)
    }
  })

  it('keeps v4 CSS entries using Tailwind CSS import layers', async () => {
    const sources = await Promise.all([
      readDemoFile('web/react-vite-tailwindcss-v4/src/style.css'),
      readDemoFile('web/vue-vite-tailwindcss-v4/src/style.css'),
      readDemoFile('web/vue-vite7-tailwindcss-v4/src/tailwind.css'),
      readDemoFile('web/nuxt-vite-tailwindcss-v4/app/assets/css/tailwind.css'),
    ])

    expect(sources[0]).toContain('@import "tailwindcss/theme.css" layer(theme);')
    expect(sources[1]).toContain('@import "tailwindcss";')
    expect(sources[1]).toContain('@source "./**/*.{vue,ts}";')
    expect(sources[2]).toContain('@import "tailwindcss";')
    expect(sources[2]).toContain('@source "./**/*.{vue,ts,js}";')
    expect(sources[3]).toContain('@import "tailwindcss";')
    expect(sources[3]).toContain('@source "../../**/*.{vue,ts,js}";')
  })

  it('keeps preflight disabled for the web demo CSS entries', async () => {
    const sources = await Promise.all([
      readDemoFile('web/react-vite-tailwindcss-v4/src/style.css'),
      readDemoFile('web/vue-vite-tailwindcss-v4/src/style.css'),
      readDemoFile('web/vue-vite7-tailwindcss-v4/src/tailwind.css'),
      readDemoFile('web/nuxt-vite-tailwindcss-v4/app/assets/css/tailwind.css'),
    ])

    for (const source of sources) {
      expect(source).not.toContain('@import "tailwindcss/preflight.css"')
      expect(source).not.toContain('button, input, select, optgroup, textarea')
    }
  })

  it('keeps arbitrary, decimal, negative, and important utilities in every web demo', async () => {
    const sources = await Promise.all([
      readDemoFile('web/react-vite-tailwindcss-v4/src/App.tsx'),
      readDemoFile('web/vue-vite-tailwindcss-v4/src/App.vue'),
    ])

    for (const source of sources) {
      expect(source).toContain('rounded-[18.5px]')
      expect(source).toContain('bg-[linear-gradient(135deg,#f8fafc_0%,#dbeafe_100%)]')
      expect(source).toContain('-mt-1.5')
      expect(source).toContain('-ml-[5.5px]')
      expect(source).toContain('!p-[18.5px]')
      expect(source).toContain('!-translate-y-[3.5px]')
      expect(source).toContain('opacity-[0.82]')
      expect(source).toContain('scale-[1.03]')
    }
  })
})
