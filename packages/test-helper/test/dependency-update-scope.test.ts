import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createPnpmCommand } from '../../../scripts/pnpm-command.mjs'
import { appendUpdateIgnoreSelectors, readUpdateIgnoreDeps } from '../../../scripts/pnpm-smart-proxy.mjs'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

function listProjects(filters: string[]) {
  const { command, args, shell } = createPnpmCommand(['list', '-r', '--depth', '-1', '--json', ...filters])
  return JSON.parse(execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8', shell })) as Array<{ name: string, path: string }>
}

describe('依赖升级项目范围', () => {
  it.each(['up:pkg', 'up:pkg:latest'])('%s 包含普通 demo 并排除 uni-app 项目', (script) => {
    const source: string = manifest.scripts[script]
    const filters = Array.from(source.matchAll(/--filter\s+['"]([^'"]+)['"]/g))
      .flatMap(match => ['--filter', match[1]!])
    const selected = listProjects(filters)
    const selectedPaths = new Set(selected.map(project => project.path))
    const demos = listProjects(['--filter', './demo/**'])

    expect(selected.map(project => project.name)).toContain('weapp-tailwindcss')
    expect(selected.map(project => project.name)).toContain('@weapp-tailwindcss/merge')
    expect(selected.map(project => project.name)).toContain('@weapp-tailwindcss-demo/weapp-vite-tailwindcss-v4')
    expect(selectedPaths.has(path.join(repoRoot, 'demo', 'web', 'vue-vite-tailwindcss-v4'))).toBe(true)
    expect(demos.length).toBeGreaterThan(0)

    for (const demo of demos) {
      const demoManifest = JSON.parse(fs.readFileSync(path.join(demo.path, 'package.json'), 'utf8'))
      const dependencies = { ...demoManifest.dependencies, ...demoManifest.devDependencies }
      const isUniApp = Object.keys(dependencies).some(name => name.startsWith('@dcloudio/'))
      expect(selectedPaths.has(demo.path), demo.name).toBe(!isUniApp)
    }

    const args = appendUpdateIgnoreSelectors(['up', ...filters], readUpdateIgnoreDeps())
    expect(args).toContain('!@dcloudio/*')
    expect(args).toContain('!@babel/*')
    expect(args).not.toContain('!weapp-vite')
    expect(manifest.scripts['up:uniapp']).toBe('pnpx @dcloudio/uvm@latest')
  })
})
