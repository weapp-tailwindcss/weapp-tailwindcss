import type { ExpectStatic } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'

export interface SourceGenerationContractAdapter {
  generate: (root: string, css: string) => Promise<{ css: string, classSet?: Set<string> }>
  dispose?: () => Promise<void>
}

/** 用真实文件、相同 CSS 和相同断言校验各生成入口的扫描语义。 */
export function sourceGenerationContract(name: string, api: SourceGenerationContractAdapter, expect: ExpectStatic, repositoryRoot: string) {
  describe(`${name} 共享来源生成契约`, () => {
    const roots: string[] = []
    afterEach(async () => {
      await api.dispose?.()
      await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
    })
    async function fixture() {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-contract-'))
      roots.push(root)
      await fs.symlink(path.join(repositoryRoot, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      await fs.mkdir(path.join(root, '中文 pages'))
      await fs.mkdir(path.join(root, 'other'))
      await fs.writeFile(path.join(root, '中文 pages', 'page.qxml'), '<view class="flex"></view>')
      await fs.writeFile(path.join(root, 'other', 'page.html'), '<div class="grid"></div>')
      return root
    }
    function assertClasses(result: { css: string, classSet?: Set<string> }, included: string[], excluded: string[]) {
      for (const value of included) {
        expect(result.css).toContain(`.${value}`)
        if (result.classSet) expect(result.classSet.has(value)).toBe(true)
      }
      for (const value of excluded) {
        expect(result.css).not.toContain(`.${value}`)
        if (result.classSet) expect(result.classSet.has(value)).toBe(false)
      }
    }
    it('自动扫描包含 qxml，source(none) 只保留显式来源和内联候选', async () => {
      const root = await fixture()
      assertClasses(await api.generate(root, '@import "tailwindcss";'), ['flex', 'grid'], [])
      assertClasses(await api.generate(root, '@import "tailwindcss" source(none); @source inline("underline");'), ['underline'], ['flex', 'grid'])
      assertClasses(await api.generate(root, '@import "tailwindcss" source(none); @source "./中文 pages";'), ['flex'], ['grid'])
      assertClasses(await api.generate(root, '@import "tailwindcss" source(none); @source not "./other/**";'), [], ['flex', 'grid'])
    })
    it('多根、正负规则、内联排除及入口隔离', async () => {
      const root = await fixture()
      const css = '@import "tailwindcss" source(none); @source "./中文 pages/**/*.qxml"; @source "./other/**/*.html"; @source not "./other/**"; @source inline("underline italic"); @source not inline("italic");'
      assertClasses(await api.generate(root, css), ['flex', 'underline'], ['grid', 'italic'])
      assertClasses(await api.generate(root, '@import "tailwindcss" source(none); @source "./other";'), ['grid'], ['flex', 'underline'])
    })
    it('符号链接来源与真实目录具有相同候选', async () => {
      const root = await fixture()
      await fs.symlink(path.join(root, '中文 pages'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
      assertClasses(await api.generate(root, '@import "tailwindcss" source(none); @source "./linked";'), ['flex'], ['grid'])
    })
    it('配置 content 的来源更新不会污染下一次请求', async () => {
      const root = await fixture()
      const config = path.join(root, 'tailwind.config.cjs')
      const css = '@import "tailwindcss" source(none); @config "./tailwind.config.cjs";'
      await fs.writeFile(config, 'module.exports = { content: ["./other/**/*.html"] }')
      assertClasses(await api.generate(root, css), ['grid'], ['flex'])
      await fs.writeFile(config, 'module.exports = { content: ["./中文 pages/**/*.qxml"] }')
      assertClasses(await api.generate(root, css), ['flex'], ['grid'])
    })
    it('同一来源新增、替换、删除和重建后不保留旧候选', async () => {
      const root = await fixture()
      const css = '@import "tailwindcss" source(none); @source "./中文 pages";'
      const file = path.join(root, '中文 pages', 'new.qxml')
      assertClasses(await api.generate(root, css), ['flex'], ['grid'])
      await fs.writeFile(file, '<view class="grid"></view>')
      assertClasses(await api.generate(root, css), ['flex', 'grid'], [])
      await fs.writeFile(file, '<view class="underline"></view>')
      assertClasses(await api.generate(root, css), ['flex', 'underline'], ['grid'])
      await fs.rm(file)
      assertClasses(await api.generate(root, css), ['flex'], ['grid', 'underline'])
      await fs.writeFile(file, '<view class="italic"></view>')
      assertClasses(await api.generate(root, css), ['flex', 'italic'], ['grid', 'underline'])
    })
  })
}
