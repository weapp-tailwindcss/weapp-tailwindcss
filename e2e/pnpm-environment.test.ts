import { describe, expect, it } from 'vitest'
import { pnpmEnvironment } from '../scripts/pnpm-environment.mjs'

describe('pnpm 子进程环境与活动入口使用同一身份', () => {
  it('Windows 合并环境时忽略键大小写，并保留显式覆盖', () => {
    expect(pnpmEnvironment({ NPM_EXECPATH: 'parent', Path: 'parent-bin' }, { npm_execpath: 'child', PATH: 'child-bin' }, true, 'win32'))
      .toEqual({ NPM_EXECPATH: 'child', PATH: 'child-bin' })
  })

  it('Windows 显式删除活动入口时清除父环境所有大小写别名', () => {
    expect(pnpmEnvironment({ NPM_EXECPATH: 'parent', Path: 'bin' }, { npm_execpath: undefined }, true, 'win32'))
      .toEqual({ PATH: 'bin' })
  })

  it('Windows 关闭继承时不重新读取父环境入口', () => {
    expect(pnpmEnvironment({ NPM_EXECPATH: 'parent' }, { Path: 'child-bin' }, false, 'win32'))
      .toEqual({ PATH: 'child-bin' })
  })

  it.each(['linux', 'darwin'])('%s 保留大小写敏感的环境键与删除语义', (platform) => {
    expect(pnpmEnvironment({ npm_execpath: 'parent', PATH: 'bin', Path: 'other' }, { npm_execpath: undefined }, true, platform))
      .toEqual({ PATH: 'bin', Path: 'other' })
  })
})
