import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

interface ProjectSettings {
  name: string
  root: string
  maxWorkers: number
  groupOrder: number
  fileParallelism: boolean
  testTimeout: number
  include: string[]
}

interface Settings {
  maxWorkers: number
  projects: ProjectSettings[]
}

function inspectProjects(maxWorkers?: number): Settings {
  // 只解析真实配置，不执行测试文件；独立进程避免嵌套使用当前 runner 的状态。
  const source = `
    import { createVitest } from 'vitest/node'
    const ctx = await createVitest(${JSON.stringify({ config: path.join(root, 'vitest.config.ts'), watch: false, ...(maxWorkers === undefined ? {} : { maxWorkers }) })})
    try {
      console.log(JSON.stringify({ maxWorkers: ctx.config.maxWorkers, projects: ctx.projects.map(project => ({ name: project.name, root: project.config.root, maxWorkers: project.config.maxWorkers, groupOrder: project.config.sequence.groupOrder, fileParallelism: project.config.fileParallelism, testTimeout: project.config.testTimeout, include: project.config.include })) }))
    }
    finally { await ctx.close() }
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  }))
}

async function inspectScheduling() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-vitest-scheduling-'))
  try {
    for (const name of ['ordinary', 'benchmark']) {
      const project = path.join(directory, name)
      await fs.mkdir(project)
      for (const file of ['one.test.mjs', 'two.test.mjs']) {
        await fs.writeFile(path.join(project, file), 'test("module lifecycle", async () => { await new Promise(resolve => setTimeout(resolve, 20)) })')
      }
    }
    // 使用真实项目配置驱动官方 runner，以模块开始/结束事件验证组间及组内资源边界。
    const source = `
      import path from 'node:path'
      import { createVitest, startVitest } from 'vitest/node'
      const settings = await createVitest({ config: ${JSON.stringify(path.join(root, 'vitest.config.ts'))}, watch: false })
      const projects = ['ordinary', 'benchmark'].map(name => {
        const project = settings.projects.find(project => project.name === (name === 'benchmark' ? 'benchmark-performance' : 'weapp-tailwindcss'))
        return { test: { root: path.join(${JSON.stringify(directory)}, name), name, globals: true, include: ['*.test.mjs'], sequence: { groupOrder: project.config.sequence.groupOrder }, fileParallelism: project.config.fileParallelism, maxWorkers: project.config.maxWorkers } }
      })
      const maxWorkers = settings.config.maxWorkers
      await settings.close()
      const events = []
      const record = (phase, module) => events.push({ phase, project: module.project.name, file: path.basename(module.moduleId), state: module.state() })
      let ctx
      try {
        ctx = await startVitest('test', [], { root: ${JSON.stringify(directory)}, config: false, projects, watch: false, maxWorkers, reporters: [{ onTestModuleStart: module => record('start', module), onTestModuleEnd: module => record('end', module) }] })
        console.log(JSON.stringify({ events, unhandled: ctx.state.getUnhandledErrors().length }))
      }
      finally { await ctx?.close() }
    `
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    })) as { events: Array<{ phase: string, project: string, file: string, state: string }>, unhandled: number }
  }
  finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

describe('workspace 测试 worker 上限', () => {
  it('真实项目保留根上限、性能项目串行例外及项目身份', () => {
    const settings = inspectProjects()
    expect(settings.maxWorkers).toBeGreaterThan(0)
    expect(settings.maxWorkers).toBeLessThanOrEqual(4)
    expect(settings.projects.length).toBeGreaterThan(0)
    expect(new Set(settings.projects.map(project => project.name)).size).toBe(settings.projects.length)
    expect(settings.projects.find(project => project.name === 'weapp-tailwindcss')?.root)
      .toBe(path.join(root, 'packages', 'weapp-tailwindcss'))
    for (const project of settings.projects) {
      const serial = project.root === path.join(root, 'benchmark', 'performance')
      expect(project.maxWorkers, project.name).toBe(serial ? 1 : settings.maxWorkers)
    }
  })

  it('显式 CLI worker 上限仍覆盖全部项目', () => {
    const settings = inspectProjects(1)
    expect(settings.maxWorkers).toBe(1)
    expect(settings.projects.length).toBeGreaterThan(0)
    for (const project of settings.projects) {
      expect(project.maxWorkers, project.name).toBe(1)
    }
  })

  it('真实 watcher 的性能项目独占串行调度组，保留原收集范围和预算', () => {
    const settings = inspectProjects()
    const benchmark = settings.projects.find(project => project.root === path.join(root, 'benchmark', 'performance'))
    expect(benchmark).toMatchObject({ maxWorkers: 1, fileParallelism: false, testTimeout: 30_000 })
    expect(benchmark?.include).toEqual(['test/**/*.test.mjs'])
    for (const project of settings.projects.filter(project => project !== benchmark)) {
      expect(project.groupOrder, project.name).not.toBe(benchmark?.groupOrder)
    }
  })

  it('官方 runner 实际执行全部模块，性能组与普通组及同组文件均不重叠', async () => {
    const result = await inspectScheduling()
    expect(result.unhandled).toBe(0)
    expect(result.events).toHaveLength(8)
    const active = new Set<string>()
    const ended = new Set<string>()
    const started = new Set<string>()
    for (const event of result.events) {
      const id = `${event.project}:${event.file}`
      if (event.phase === 'start') {
        expect(started.has(id), id).toBe(false)
        if (event.project === 'benchmark') {
          expect(active.size).toBe(0)
        }
        else {
          expect([...active].some(id => id.startsWith('benchmark:'))).toBe(false)
        }
        started.add(id)
        active.add(id)
      }
      else {
        expect(event.state, id).toBe('passed')
        expect(active.delete(id), id).toBe(true)
        ended.add(id)
      }
    }
    expect(active.size).toBe(0)
    expect([...started].sort()).toEqual(['benchmark:one.test.mjs', 'benchmark:two.test.mjs', 'ordinary:one.test.mjs', 'ordinary:two.test.mjs'])
    expect(ended).toEqual(started)
  })
})
