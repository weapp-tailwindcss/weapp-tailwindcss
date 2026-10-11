import { describe, expect, it } from 'vitest'
import { prepareGenerationModuleRequests } from '../src/v4/module-requests'

describe('Tailwind 生成模块请求', () => {
  it.each([
    ['/project', '/project/config.cjs', '/project/config.cjs'],
    ['/project/src', '../中文 config.cjs', '/project/中文 config.cjs'],
    ['C:\\project', 'C:/project/config.cjs', 'C:/project/config.cjs'],
    ['C:\\project', 'D:/config.cjs', 'D:/config.cjs'],
    ['/', '/config.cjs', '/config.cjs'],
  ])('规范化 %s 中的 %s', (base, file, expected) => {
    expect(prepareGenerationModuleRequests(`@config "${file}";`, base).css).toContain(`"${expected}"`)
  })
  it('保留包请求并固定相对插件请求的身份', () => {
    const css = '@plugin "@tailwindcss/forms"; @plugin "./plugin.cjs";'
    expect(prepareGenerationModuleRequests(css, '/project')).toEqual({
      css: '@plugin "@tailwindcss/forms"; @plugin "/project/plugin.cjs";',
      files: ['/project/plugin.cjs'],
    })
  })
})
