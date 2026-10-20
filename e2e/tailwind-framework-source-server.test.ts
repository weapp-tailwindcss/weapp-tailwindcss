import { stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { cssDeclarations } from './tailwind-capabilities/css'
import { frameworkSourceProfiles, sourceCandidate, sourceFrameworks } from './tailwind-capabilities/framework-source/fixtures'
import { frameworkDependencies, withFrameworkSourceServer } from './tailwind-capabilities/framework-source/server'

async function within<T>(label: string, operation: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`框架服务阶段超时：${label}`)), 8000)
    })])
  }
  finally {
    clearTimeout(timer)
  }
}

// 真实 Vite 与编译器集成，不导入 Playwright，也不打开浏览器。
describe('真实框架服务编译与资源协议', () => {
  for (const framework of sourceFrameworks) {
    it(`${framework}转换真实源码，监听保存且关闭后删除自己的临时目录`, async () => {
      const root = path.resolve(process.env.TAILWIND_FRAMEWORK_DEPENDENCY_ROOT ?? process.cwd())
      const logs: string[] = []
      let directory = ''
      const dependencies = await frameworkDependencies(root, framework)
      for (const name of ['runtime', 'merge', 'cva', 'variants']) {
        expect(dependencies.aliases.some(alias => alias.find.test(`@weapp-tailwindcss/${name}`) && alias.replacement === path.join(root, 'packages-runtime', name, 'src', 'index.ts'))).toBe(true)
      }
      await withFrameworkSourceServer(root, 'framework-server-test', framework, logs, async (runtime) => {
        directory = path.dirname(runtime.source)
        expect((await stat(runtime.source)).isFile()).toBe(true)
        const document = await within('首页请求', fetch(runtime.url, { signal: AbortSignal.timeout(8000) }).then(response => response.text()))
        expect(document).toContain(runtime.instance)
        const url = framework === 'react' ? '/Probe.tsx' : '/Probe.vue'
        const initial = await within('首次源码转换', runtime.server.transformRequest(url))
        expect(initial?.code).toContain('framework-root')
        expect(initial?.code).toContain(framework === 'react' ? 'React.createElement' : '_normalizeClass')
        expect(initial?.code).not.toContain('w-[123px]')
        const initialCss = await within('首次CSS转换', runtime.server.transformRequest('/entry.css?direct'))
        expect(cssDeclarations(initialCss!.code).byClass.has('p-4')).toBe(true)
        const positive = frameworkSourceProfiles.filter(profile => profile.framework === framework && profile.kind !== 'interpolation-negative')
        const negative = frameworkSourceProfiles.find(profile => profile.framework === framework && profile.kind === 'interpolation-negative')!
        for (const revision of ['added', 'replaced', 'deleted'] as const) {
          const saving = runtime.updateSource(revision)
          await expect(runtime.updateSource(revision)).rejects.toThrow('串行')
          const saved = await saving
          const updated = await within(`${revision}保存后源码转换`, runtime.server.transformRequest(url))
          expect(updated?.code).toContain(`framework-server-test/${framework}/${revision}`)
          if (revision === 'deleted') {
            expect(saved).not.toContain('w-[')
            expect(updated?.code).not.toContain('w-[')
          }
          else {
            for (const profile of positive) {
              for (const active of [true, false]) {
                expect(updated?.code).toContain(sourceCandidate(profile, revision, active))
              }
            }
          }
          const css = await within(`${revision}保存后CSS转换`, runtime.server.transformRequest('/entry.css?direct'))
          const parsed = cssDeclarations(css!.code)
          expect(parsed.byClass.has('p-4')).toBe(true)
          if (revision !== 'deleted') {
            for (const profile of positive) {
              expect(parsed.byClass.has(sourceCandidate(profile, revision, true)), profile.id).toBe(true)
              expect(parsed.byClass.has(sourceCandidate(profile, revision, false)), profile.id).toBe(true)
            }
          }
          expect(parsed.byClass.has(sourceCandidate(negative, 'added', true))).toBe(false)
          expect(parsed.byClass.has(sourceCandidate(negative, 'added', false))).toBe(false)
          expect(parsed.byClass.has(sourceCandidate(negative, 'replaced', true))).toBe(false)
          expect(parsed.byClass.has(sourceCandidate(negative, 'replaced', false))).toBe(false)
        }
      })
      expect(directory).toBeTruthy()
      await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(logs.filter(line => line.startsWith('error:'))).toEqual([])
    }, 30_000)
  }
})
