import { test } from 'vitest'
import { analyzeTailwindCssDirectives, postcss } from '@/index'

function createDirectiveCorpus(size: number) {
  const parts = [
    '@import "weapp-tailwindcss";',
    '@plugin "@iconify/tailwind4" {',
    '  prefix: "i";',
    '}',
    '@custom-variant any-hover {',
    '  @media (any-hover: hover) {',
    '    &:hover { @slot; }',
    '  }',
    '}',
  ]

  for (let i = 0; i < size; i++) {
    parts.push([
      `.card-${i} {`,
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 12rpx;',
      '  border-radius: 28rpx;',
      '  background-image: linear-gradient(to bottom right, rgb(15 23 42 / 0.95), rgb(51 65 85 / 0.95));',
      '  box-shadow: 0 20px 25px -5px rgb(15 23 42 / 0.3);',
      '}',
      `.apply-${i} { @apply flex flex-col gap-3 rounded-[28rpx] text-white; }`,
    ].join('\n'))
  }

  return parts.join('\n')
}

const css = createDirectiveCorpus(400)

test('tailwind directive analysis benchmark', async ({ bench }) => {
  await bench.compare(
    bench('parse and scan five times', () => {
      for (let i = 0; i < 5; i++) {
        analyzeTailwindCssDirectives(postcss.parse(css), { importFallback: true })
      }
    }),
    bench('parse once and scan once', () => {
      analyzeTailwindCssDirectives(postcss.parse(css), { importFallback: true })
    }),
  )
})
