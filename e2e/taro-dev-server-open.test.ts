import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { buildCases } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const probe = fileURLToPath(new URL('./fixtures/taro-dev-server-open/probe.mjs', import.meta.url))
const projects = [
  'taro-webpack-react-tailwindcss-v4',
  'taro-webpack-vue3-tailwindcss-v4',
] as const

describe('Taro webpack Web 自动打开边界', () => {
  it('覆盖 Watch registry 消费的全部 Taro webpack Web 项目', () => {
    const consumed = buildCases(repoRoot)
      .filter(item => item.name.startsWith('taro-webpack-') && item.webHmr)
      .map(item => path.basename(item.cwd))
    expect([...new Set(consumed)].sort()).toEqual([...projects].sort())
  })

  for (const project of projects) {
    it.each(['none', undefined, 'firefox'])(`${project} 将 BROWSER=%s 传入真实 Taro/WDS 配置`, async (browser) => {
      const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development', TARO_ENV: 'h5' }
      if (browser === undefined) {
        delete env.BROWSER
      }
      else {
        env.BROWSER = browser
      }
      const { stdout } = await execa(process.execPath, [probe, path.join(repoRoot, 'demo', project)], {
        cwd: repoRoot,
        env,
        extendEnv: false,
        timeout: 30_000,
      })
      const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!)
      expect(result.project).toBe(project)
      expect(result.browser).toBe(browser ?? null)
      if (browser === 'none') {
        expect(result.configuredOpen).toBe(false)
        expect(result.normalizedOpen).toEqual([])
      }
      else {
        expect(result.configuredOpen).toBeNull()
        expect(result.normalizedOpen).toHaveLength(1)
        expect(result.normalizedOpen[0].target).toBe('http://127.0.0.1:10086/')
      }
    }, 35_000)
  }
})
