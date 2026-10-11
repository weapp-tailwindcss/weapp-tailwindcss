import { Project } from 'ts-morph'
import { describe, expect, it } from 'vitest'

import {
  buildApiIndexFrontmatter,
  buildInterfaceDoc,
  buildInterfaceSeoFrontmatter,
  buildOptionsGroupSeoFrontmatter,
  buildOtherInterfacesSeoFrontmatter,
  buildUserDefinedOptionsOverviewFrontmatter,
  normalizeTypeReferenceText,
  renderInterfaceDoc,
  renderTypeText,
} from './generate-api-docs.ts'

describe('generate-api-docs SEO frontmatter', () => {
  it('provides strong metadata for interface pages', () => {
    const frontmatter = buildInterfaceSeoFrontmatter({
      name: 'ApplyOptions',
      description: 'Tailwind 运行时补丁行为配置。',
    })

    expect(frontmatter.description.length).toBeGreaterThanOrEqual(16)
    expect(frontmatter.keywords.length).toBeGreaterThanOrEqual(8)
    expect(frontmatter.keywords).toContain('ApplyOptions')
  })

  it('falls back when interface descriptions are too short', () => {
    const frontmatter = buildInterfaceSeoFrontmatter({
      name: 'DisabledOptions',
      description: '禁用插件功能的细粒度选项。',
    })

    expect(frontmatter.description).toBe('DisabledOptions 的类型说明，列出公开属性、参数和使用边界。')
  })

  it('writes plain text descriptions when JSDoc uses inline code', () => {
    const frontmatter = buildInterfaceSeoFrontmatter({
      name: 'PostcssPluginOptions',
      description: '`weapp-tailwindcss` PostCSS 插件配置。',
    })

    expect(frontmatter.description).toBe('weapp-tailwindcss PostCSS 插件配置。')
  })

  it('provides strong metadata for generated index pages', () => {
    const userDefinedOptions = buildUserDefinedOptionsOverviewFrontmatter({
      description: 'UserDefinedOptions 配置总览，按源码分组列出可传入的插件选项。',
    })
    const optionsGroup = buildOptionsGroupSeoFrontmatter({
      title: '一般配置',
      sidebarLabel: '⚙️ 一般配置',
      displayTitle: '⚙️ 一般配置',
      order: 3,
    }, 17)
    const otherInterfaces = buildOtherInterfacesSeoFrontmatter(9)
    const index = buildApiIndexFrontmatter(true)

    for (const frontmatter of [userDefinedOptions, optionsGroup, otherInterfaces, index]) {
      expect(frontmatter.description.length).toBeGreaterThanOrEqual(16)
      expect(frontmatter.keywords.length).toBeGreaterThanOrEqual(8)
    }
  })
})

describe('generate-api-docs source extraction', () => {
  it('keeps @see URLs intact and does not expand array internals', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile('api-fixture.ts', `
      export interface ApiFixture {
        /**
         * 入口文件列表。
         *
         * @see https://github.com/sonofmagic/weapp-tailwindcss/issues/7
         */
        cssEntries?: string[]
      }
    `)
    const doc = buildInterfaceDoc('ApiFixture', sourceFile.getInterfaceOrThrow('ApiFixture'))

    expect(doc?.properties[0]?.tags.see).toEqual([
      'https://github.com/sonofmagic/weapp-tailwindcss/issues/7',
    ])
    expect(doc?.properties[0]?.nested).toBeUndefined()
  })

  it('uses Chinese labels for optional interface properties', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile('api-fixture.ts', `
      export interface ApiFixture {
        /**
         * 入口文件列表。
         */
        cssEntries?: string[]
      }
    `)
    const doc = buildInterfaceDoc('ApiFixture', sourceFile.getInterfaceOrThrow('ApiFixture'))
    const rendered = renderInterfaceDoc(doc)

    expect(doc?.properties[0]?.optional).toBe(true)
    expect(doc?.properties[0]?.description).toBe('入口文件列表。')
    expect(rendered).toContain('> 可选 | **cssEntries**: `string[]`')
    expect(rendered).not.toContain('`optional`')
  })

  it('does not render nested properties from external builtin types', () => {
    const project = new Project({
      compilerOptions: {
        lib: ['es2020'],
      },
      useInMemoryFileSystem: true,
    })
    const sourceFile = project.createSourceFile('/repo/api-fixture.ts', `
      export interface ApiFixture {
        /**
         * 生成的类名集合。
         */
        classSet: Set<string>
      }
    `)
    const doc = buildInterfaceDoc('ApiFixture', sourceFile.getInterfaceOrThrow('ApiFixture'))
    const rendered = renderInterfaceDoc(doc)

    expect(rendered).toContain('> **classSet**: `Set<string>`')
    expect(rendered).not.toContain('__@toStringTag')
    expect(rendered).not.toContain('#### size')
  })

  it('renders scalar union aliases as type definitions', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile('api-fixture.ts', `
      export type CompilerTarget = 'tailwind' | 'weapp' | 'web'
    `)
    const doc = buildInterfaceDoc('CompilerTarget', sourceFile.getTypeAliasOrThrow('CompilerTarget'))
    const rendered = renderInterfaceDoc(doc)

    expect(doc?.properties).toEqual([])
    expect(rendered).toContain(`type CompilerTarget = 'tailwind' | 'weapp' | 'web'`)
    expect(rendered).not.toContain('### length')
  })
})

describe('generate-api-docs type links', () => {
  it('normalizes import-qualified type references', () => {
    expect(normalizeTypeReferenceText('import("@/tailwindcss/runtime-types").TailwindCssOptions')).toBe('TailwindCssOptions')
  })

  it('links exported API type references in markdown output', () => {
    const rendered = renderTypeText('import("@/tailwindcss/runtime-types").TailwindCssOptions', {
      currentDir: 'options',
      linkableTypes: new Set(['TailwindCssOptions']),
    })

    expect(rendered).toBe('[`TailwindCssOptions`](../interfaces/TailwindCssOptions.md)')
  })
})
