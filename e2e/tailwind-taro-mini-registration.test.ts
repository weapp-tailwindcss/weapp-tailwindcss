import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { MULTIPLATFORM_BUILD_OUTPUT_CASES } from './multiplatform-build-output/cases'
import { documentedOnly } from './tailwind-capabilities/build-matrix/cases'

const projects = ['taro-vite-react-tailwindcss-v4', 'taro-vite-vue3-tailwindcss-v4', 'taro-webpack-react-tailwindcss-v4', 'taro-webpack-vue3-tailwindcss-v4']
const outputs = { weapp: ['wxss', 'wxml'], swan: ['css', 'swan'], alipay: ['acss', 'axml'], tt: ['ttss', 'ttml'], qq: ['qss', 'qml'], jd: ['jxss', 'jxml'] } as const

for (const project of projects) {
  it.each(Object.entries(outputs))(`${project} %s必须绑定真实构建及独立平台产物，不能只有登记占位`, async (platform, [style, template]) => {
    const matches = MULTIPLATFORM_BUILD_OUTPUT_CASES.filter(item => path.resolve(item.projectDir) === path.resolve('demo', project) && item.platform === platform)
    expect(matches).toHaveLength(1)
    const item = matches[0]!
    expect(documentedOnly(item)).toBe(false)
    const manifest = JSON.parse(await readFile(path.resolve('demo', project, 'package.json'), 'utf8'))
    expect(item.command).toEqual(['pnpm', '--filter', manifest.name, 'run', `build:${platform}`])
    expect(manifest.scripts[`build:${platform}`]).toBeTruthy()
    expect(item.requiredFiles).toContain(`dist/app.${style}`)
    expect(item.requiredFiles).toContain(`dist/pages/index/index.${template}`)
    expect(item.styleFileExtensions).toEqual([`.${style}`])
    const color = project.includes('webpack') ? '534312' : '123456'
    expect(item.styleContains).toContain(`.bg-_b_h${color}_B`)
    expect(item.textContains).toContain(`bg-_b_h${color}_B`)
    expect(item.notContains?.some(value => value instanceof RegExp && value.test('@tailwind utilities;'))).toBe(true)
  })
}

it('新增本地入口保留原支付宝专项的独立issue998合同', () => {
  const item = MULTIPLATFORM_BUILD_OUTPUT_CASES.find(item => path.resolve(item.projectDir) === path.resolve('demo', 'taro-vite-react-tailwindcss-v4') && item.platform === 'alipay')!
  expect(item.status).toBe('ci')
  expect(item.fileAssertions?.some(assertion => assertion.file === 'dist/pages/issue-998/index.acss')).toBe(true)
})
