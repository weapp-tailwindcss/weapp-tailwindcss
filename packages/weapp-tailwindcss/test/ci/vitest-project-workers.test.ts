import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

interface ProjectSettings {
  name: string
  root: string
  maxWorkers: number
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
      console.log(JSON.stringify({ maxWorkers: ctx.config.maxWorkers, projects: ctx.projects.map(project => ({ name: project.name, root: project.config.root, maxWorkers: project.config.maxWorkers })) }))
    }
    finally { await ctx.close() }
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  }))
}

describe('workspace 测试 worker 上限', () => {
  it('每个真实项目继承根上限，并保留项目根目录与身份', () => {
    const settings = inspectProjects()
    expect(settings.maxWorkers).toBeGreaterThan(0)
    expect(settings.maxWorkers).toBeLessThanOrEqual(4)
    expect(settings.projects.length).toBeGreaterThan(0)
    expect(new Set(settings.projects.map(project => project.name)).size).toBe(settings.projects.length)
    expect(settings.projects.find(project => project.name === 'weapp-tailwindcss')?.root)
      .toBe(path.join(root, 'packages', 'weapp-tailwindcss'))
    for (const project of settings.projects) {
      expect(project.maxWorkers, project.name).toBe(settings.maxWorkers)
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
})
