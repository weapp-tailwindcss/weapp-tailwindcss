import { describe, expect, it, vi } from 'vitest'
import { resolveSfcStyleRequestFromKnownSource, resolveSfcStyleSourceFromOutputFile } from '@/bundlers/vite/generate-bundle/sfc-style-source'

describe('bundlers/vite sfc style source resolver', () => {
  it('keeps scoped Vue style metadata on inferred remembered css sources', async () => {
    const sourceFile = '/project/src/components/HelloWorld.vue'
    const snapshot = {
      entries: [
        {
          file: 'components/HelloWorld.js',
          output: {
            type: 'chunk',
            facadeModuleId: sourceFile,
            moduleIds: [sourceFile],
            modules: {
              [sourceFile]: {},
            },
          },
          source: '',
          type: 'js',
        },
      ],
    } as any

    const remembered = await resolveSfcStyleSourceFromOutputFile(
      'components/HelloWorld.wxss',
      snapshot,
      '/project/dist/build/mp-weixin',
      '/project/src',
      file => file.endsWith('.wxss'),
      () => [
        '<template><view /></template>',
        '<style lang="scss" scoped>',
        '.hello-world-shell { @apply flex; }',
        '</style>',
      ].join('\n'),
      vi.fn(),
    )

    expect(remembered).toMatchObject({
      outputFile: 'components/HelloWorld.wxss',
      rawSource: expect.stringContaining('@apply flex'),
      sourceFile: `${sourceFile}?vue&type=style&index=0&scoped=true&lang=scss`,
    })
  })

  it('recovers scoped Vue style request metadata from known SFC source', () => {
    const sourceFile = '/project/src/components/HelloWorld.vue'
    const request = resolveSfcStyleRequestFromKnownSource(
      sourceFile,
      [
        '<template><view /></template>',
        '<style lang="scss" scoped>',
        '.hello-world-shell { @apply flex; }',
        '</style>',
      ].join('\n'),
      '.hello-world-shell { @apply flex; }',
    )

    expect(request).toBe(`${sourceFile}?vue=&type=style&index=0&scoped=true&lang=scss`)
  })

  it('matches the current style source when an SFC has multiple style blocks', () => {
    const sourceFile = '/project/src/pages/index.vue'
    const request = resolveSfcStyleRequestFromKnownSource(
      sourceFile,
      [
        '<style>',
        '.plain { color: red; }',
        '</style>',
        '<style scoped>',
        '.scoped { @apply flex; }',
        '</style>',
      ].join('\n'),
      '.scoped { @apply flex; }',
    )

    expect(request).toBe(`${sourceFile}?vue=&type=style&index=1&scoped=true`)
  })

  it('uses the current request index when compiled css no longer matches the scoped source block', () => {
    const sourceFile = '/project/src/pages/index.vue'
    const request = resolveSfcStyleRequestFromKnownSource(
      sourceFile,
      [
        '<style>',
        '.plain { color: red; }',
        '</style>',
        '<style lang="scss" scoped>',
        '.scoped { @apply i-[mdi--github-circle]; }',
        '</style>',
      ].join('\n'),
      '.i-\\[mdi--github-circle\\].data-v-fixture { display: inline-block; }',
      `${sourceFile}?vue&type=style&index=1&lang.scss`,
    )

    expect(request).toBe(`${sourceFile}?vue=&type=style&index=1&scoped=true&lang=scss`)
  })
})
