import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'
import { repo } from './catalog.mjs'
import { buildEnvironment, dryRun, runTurbo, withTurboFixture } from './turbo-fixture.mjs'

const nuxt = '@weapp-tailwindcss-demo/web-nuxt-vite-tailwindcss-v4'
const guarded = []
for (const file of await fg('demo/**/package.json', { cwd: repo, ignore: ['**/node_modules/**', '**/dist/**', '**/.output/**', '**/.nuxt/**', '**/unpackage/**'] })) {
  const manifest = JSON.parse(await readFile(path.resolve(repo, file), 'utf8'))
  if (Object.values(manifest.scripts ?? {}).some(script => /(?:taro|uni)-build-guard\.mjs/.test(script))) {
    guarded.push({ name: manifest.name })
  }
}

describe('Turbo 构建缓存边界', () => {
  it('实际解析 Nuxt 输出与受交互状态影响的构建任务', async () => {
    const cache = await mkdtemp(path.join(os.tmpdir(), 'weapp-turbo-dry-'))
    try {
      const result = await dryRun(repo, [`--cache-dir=${cache}`, `--filter=${nuxt}`, ...guarded.map(item => `--filter=${item.name}`)])
      const task = result.tasks.find(item => item.package === nuxt)
      expect(task.resolvedTaskDefinition.outputs).toContain('.output/**')
      expect(task.dependencies).toContain('weapp-tailwindcss#build')
      expect(guarded.length).toBeGreaterThan(0)
      for (const item of guarded) {
        const task = result.tasks.find(task => task.package === item.name)
        expect(task.resolvedTaskDefinition.cache, item.name).toBe(false)
        expect(task.resolvedTaskDefinition.dependsOn, item.name).toContain('^build')
      }
    }
    finally {
      await rm(cache, { recursive: true, force: true })
    }
  }, 30_000)

  it('缓存命中能恢复 Nuxt server/public，且不重新执行构建', async () => {
    await withTurboFixture([{ name: nuxt, output: '.output' }], async ({ cwd, entries: [item], count }) => {
      await runTurbo(cwd, [`--filter=${nuxt}`])
      expect(await count(item)).toBe(1)
      await rm(path.join(item.directory, '.output'), { recursive: true })
      const result = await dryRun(cwd, [`--filter=${nuxt}`])
      expect(result.tasks[0].cache.status).toBe('HIT')
      await runTurbo(cwd, [`--filter=${nuxt}`])
      expect(await count(item)).toBe(1)
      expect(await readFile(path.join(item.directory, '.output', 'server', 'index.mjs'), 'utf8')).toContain('export default')
      expect(await readFile(path.join(item.directory, '.output', 'public', 'index.html'), 'utf8')).toContain('<main>fixture</main>')
    })
  }, 30_000)

  it('每次执行 guard 任务，不复用另一种交互状态的成功缓存', async () => {
    await withTurboFixture(guarded, async ({ cwd, entries, count }) => {
      await runTurbo(cwd, [])
      await runTurbo(cwd, [])
      for (const item of entries) {
        expect(await count(item), item.name).toBe(2)
      }
    })
  }, 30_000)

  it('跳过与严格构建开关都参与最终任务 hash', async () => {
    await withTurboFixture([{ name: nuxt, output: '.output' }], async ({ cwd }) => {
      const initial = await dryRun(cwd)
      const hash = initial.tasks[0].hash
      for (const name of buildEnvironment) {
        const result = await dryRun(cwd, [], { [name]: '1' })
        expect(result.tasks[0].hash, name).not.toBe(hash)
        expect(result.globalCacheInputs.environmentVariables.specified.env, name).toContain(name)
      }
    })
  }, 30_000)
})
