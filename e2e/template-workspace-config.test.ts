import { describe, expect, it } from 'vitest'
import { isRemovedTemplateName } from '../scripts/template-utils'
import { updateTemplateWorkspaceConfig } from '../scripts/template-workspace-config'

const managedPackages = [
  { name: 'weapp-tailwindcss', version: '5.5.0' },
  { name: '@weapp-tailwindcss/postcss', version: '3.3.1' },
]

describe('template workspace config', () => {
  it('updates scoped and unscoped release-age exclusions without changing unrelated entries', () => {
    const source = `packages:\n  - .\nminimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - '@weapp-tailwindcss/postcss@3.0.4'\n  - weapp-tailwindcss@5.0.7\n  - tailwindcss@4.3.3\n`

    const result = updateTemplateWorkspaceConfig(source, managedPackages)

    expect(result.changed).toBe(true)
    expect(result.content).toContain('\'@weapp-tailwindcss/postcss@3.3.1\'')
    expect(result.content).toContain('weapp-tailwindcss@5.5.0')
    expect(result.content).toContain('tailwindcss@4.3.3')
  })

  it('is idempotent after versions are synchronized', () => {
    const source = `minimumReleaseAgeExclude:\n  - weapp-tailwindcss@5.1.3\n`
    const first = updateTemplateWorkspaceConfig(source, managedPackages)
    const second = updateTemplateWorkspaceConfig(first.content, managedPackages)

    expect(first.changed).toBe(true)
    expect(first.content).toContain('@weapp-tailwindcss/postcss@3.3.1')
    expect(second).toEqual({ changed: false, content: first.content })
  })

  it('keeps configs without release-age exclusions unchanged', () => {
    const source = `packages:\n  - .\n`

    expect(updateTemplateWorkspaceConfig(source, managedPackages)).toEqual({
      changed: false,
      content: source,
    })
  })

  it('adds required package patterns without duplicating existing entries', () => {
    const source = `minimumReleaseAgeExclude:\n  - weapp-tailwindcss@5.5.0\n  - '@weapp-vite/*'\n`
    const result = updateTemplateWorkspaceConfig(source, managedPackages, [
      'weapp-vite',
      '@weapp-vite/*',
    ])

    expect(result.changed).toBe(true)
    expect(result.content.match(/@weapp-vite\/\*/g)).toHaveLength(1)
    expect(result.content).toContain('weapp-vite')
  })
})

describe('removed template guard', () => {
  it.each([
    'native-weapp-tailwindcss-template',
    'taro-react-tailwind-vscode-template',
    'taro-vue3-tailwind-vscode-template',
    'uni-app-vite-vue3-tailwind-vscode-template',
    'uni-app-vue2-tailwind-vscode-template',
    'uni-app-vue3-tailwind-hbuilder-template',
    'uni-app-x-hbuilderx',
    'vue-mini-tailwindcss-template',
    'weapp-native-mina-tailwindcss-template',
  ])('rejects removed v3 template %s', (templateName) => {
    expect(isRemovedTemplateName(templateName)).toBe(true)
  })
})
