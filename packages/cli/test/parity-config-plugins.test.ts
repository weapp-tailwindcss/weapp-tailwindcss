import { afterEach, expect, test } from 'vitest'
import { createCliFixture, runCli } from './parity-harness'

const fixtures: Array<{ cleanup: () => Promise<void> }> = []
afterEach(async () => Promise.all(fixtures.splice(0).map(fixture => fixture.cleanup())))

async function fixture(files: Record<string, string>) {
  const result = await createCliFixture(files)
  fixtures.push(result)
  return result
}

test('loads JavaScript configuration and content sources', async () => {
  const project = await fixture({
    'tailwind.config.js': `module.exports = { content: ['./src/**/*.html'], theme: { extend: { colors: { primary: '#123456' } } } }`,
    'src/index.html': '<div class="bg-primary"></div>',
    'src/input.css': '@config "../tailwind.config.js";\n@import "tailwindcss" source(none);',
  })
  await runCli(project.root, ['-i', 'src/input.css', '-o', 'dist/out.css', '--silent'])
  expect(await project.read('dist/out.css')).toContain('#123456')
})

test('loads CommonJS and ESM plugins with options', async () => {
  const project = await fixture({
    'plugin.cjs': `module.exports = function ({ addUtilities }) { addUtilities({ '.custom-cjs': { display: 'block' } }) }`,
    'plugin.mjs': `export default function ({ addUtilities }) { addUtilities({ '.custom-esm': { color: 'red' } }) }`,
    'input.css': `@import "tailwindcss" source(none);\n@plugin "./plugin.cjs";\n@plugin "./plugin.mjs";\n@source inline("custom-cjs custom-esm");`,
  })
  await runCli(project.root, ['-i', 'input.css', '-o', 'out.css', '--silent'])
  const css = await project.read('out.css')
  expect(css).toContain('.custom-cjs')
  expect(css).toContain('.custom-esm')
})

test('resolves @source and @plugin relative to an imported stylesheet', async () => {
  const project = await fixture({
    'src/input.css': '@import "./nested/entry.css";',
    'src/nested/entry.css': '@import "tailwindcss" source(none);\n@plugin "./plugin.js";\n@source "./content.html";',
    'src/nested/plugin.js': `module.exports = ({ addVariant }) => addVariant('hocus', ['&:hover', '&:focus'])`,
    'src/nested/content.html': '<div class="hocus:underline"></div>',
  })
  await runCli(project.root, ['-i', 'src/input.css', '-o', 'out.css', '--silent'])
  expect(await project.read('out.css')).toContain('.hocus\\:underline')
})
