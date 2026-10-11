import fs from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import fg from 'fast-glob'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { clearProjectBuildState } from './projectTest'

const projectRoot = path.resolve(__dirname, '../demo/uni-app-vite-tailwindcss-v4')
const cssOutputPattern = '**/*.{css,wxss,acss,qss}'
const textOutputPattern = '**/*.{html,js,css,wxml,wxss}'

async function buildPlatform(platform: 'mp-weixin' | 'h5', webCompat?: string) {
  await clearProjectBuildState(projectRoot)
  await execa('pnpm', ['run', `build:${platform}`], {
    cwd: projectRoot,
    stdio: process.env.E2E_DEBUG_BUILD === '1' ? 'inherit' : 'pipe',
    env: {
      ...process.env,
      ...(webCompat === undefined ? {} : { WEAPP_TW_WEB_COMPAT: webCompat }),
      NODE_ENV: 'production',
      BROWSERSLIST_ENV: 'production',
      UNI_BUILD_STRICT: '1',
      RUST_BACKTRACE: process.env.RUST_BACKTRACE ?? '1',
      npm_package_json: path.resolve(projectRoot, 'package.json'),
      INIT_CWD: projectRoot,
    },
  })
}

async function collectOutput(pattern: string, outputDir: string) {
  const root = path.resolve(projectRoot, outputDir)
  const files = await fg(pattern, {
    absolute: false,
    cwd: root,
    onlyFiles: true,
  })

  return Promise.all(files.sort().map(async (file) => {
    const absolutePath = path.join(root, file)
    return {
      file,
      text: await fs.readFile(absolutePath, 'utf8'),
    }
  }))
}

describe('uni-app vite vue3 Tailwind v4 cascade layer output', () => {
  it('unwraps custom cascade layers for mp-weixin css output', async () => {
    await buildPlatform('mp-weixin')

    const css = (await collectOutput(cssOutputPattern, 'dist/build/mp-weixin'))
      .map(entry => entry.text)
      .join('\n')

    expect(css, 'mp-weixin css should not keep unsupported @layer wrappers').not.toMatch(/@layer\b/)
    expect(css, 'mp-weixin css should keep custom Tailwind v4 layer rules').toMatch(/\.layer-card-v4\s*\{[\s\S]*?display:\s*flex/)
    expect(css, 'mp-weixin css should keep declarations inside custom Tailwind v4 layer rules').toMatch(/color:\s*var\(--color-midnight\)/)
    const baseIndex = css.indexOf('button::after')
    const componentIndex = css.indexOf('.layer-card-v4')
    const utilityIndex = css.indexOf('.m-3')
    const unlayeredIndex = css.search(/wx-button\s*\{\s*background:\s*#444/)
    expect(baseIndex, 'mp-weixin css should emit base layer rules').toBeGreaterThanOrEqual(0)
    expect(componentIndex, 'mp-weixin css should emit component layer rules').toBeGreaterThan(baseIndex)
    expect(utilityIndex, 'mp-weixin css should emit utility layer rules after components').toBeGreaterThan(componentIndex)
    expect(unlayeredIndex, 'mp-weixin css should keep unlayered overrides after utilities').toBeGreaterThan(utilityIndex)
    expect(css.match(/(?:^|[\n,{])\s*button::after/g), 'mp-weixin css should not replay base layer rules').toHaveLength(1)
    expect(css.match(/\.layer-card-v4/g), 'mp-weixin css should not replay component layer rules').toHaveLength(1)
    expect(css.match(/wx-button\s*\{\s*background:\s*#000/g), 'mp-weixin css should not replay layer declarations').toHaveLength(1)
    expect(css.search(/wx-button\s*\{\s*background:\s*#000/), 'base background should precede utilities').toBeLessThan(utilityIndex)
    expect(css.match(/wx-button\s*\{\s*background:\s*#444/g), 'mp-weixin css should preserve the unlayered override').toHaveLength(1)
  }, 600_000)

  it('uses web compatibility output for H5 css by default', async () => {
    await buildPlatform('h5')

    const output = (await collectOutput(textOutputPattern, 'dist/build/h5'))
      .map(entry => entry.text)
      .join('\n')

    expect(output, 'H5 output should remove native Tailwind v4 @layer wrappers by default').not.toMatch(/@layer\s+components/)
    expect(output, 'H5 output should keep custom Tailwind v4 layer rules').toMatch(/\.layer-card-v4\s*\{[\s\S]*?display:\s*flex/)
    expect(output, 'H5 output should keep declarations inside custom Tailwind v4 layer rules').toMatch(/color:\s*#121063/)
  }, 600_000)

  it('keeps scoped Vue component css free of injected mini-program preflight', async () => {
    await buildPlatform('mp-weixin')

    const output = await collectOutput(textOutputPattern, 'dist/build/mp-weixin')
    const helloWorldCss = output.find(entry => entry.file === 'components/HelloWorld.wxss')
    const mainCss = output.find(entry => entry.file === 'main.wxss')

    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped component css should be emitted').toContain('.hello-world-shell')
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped @apply should be expanded').toMatch(/display:\s*flex/)
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped @apply should keep rpx radius').toMatch(/border-radius:\s*20rpx/)
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped @apply should keep color output').toMatch(/background-color:\s*#f8fafc/)
    expect(mainCss?.text ?? '', 'main css icon selectors should be mini-program safe').toContain('.i-_bmdi--github-circle_B')
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped css should not replay unrelated global icon selectors').not.toContain('.i-_bmdi--github-circle_B')
    expect(mainCss?.text ?? '', 'main css content selectors should be mini-program safe').toContain('.before_ccontent-')
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped css should not replay unrelated global content selectors').not.toContain('.before_ccontent-')
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped icon selectors should not keep CSS escapes').not.toContain('.i-\\[')
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped variants should not keep CSS escapes').not.toContain('.before\\:')
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped component css should not inject mini-program preflight').not.toContain('view,text,::after,::before')
    expect(helloWorldCss?.text ?? '', 'HelloWorld scoped component css should not inject reset declarations').not.toMatch(/box-sizing:\s*border-box/)
  }, 600_000)

  it.each(['0', '1'])('keeps order-only utilities in their H5 stylesheet with webCompat=%s', async (webCompat) => {
    await buildPlatform('h5', webCompat)
    const styles = await collectOutput(cssOutputPattern, 'dist/build/h5')
    const main = styles.filter(entry => entry.text.includes('.layer-card-v4'))
    expect(main).toHaveLength(1)
    expect(main[0]!.text).not.toMatch(/\.mt-8\s*\{/)
    expect(main[0]!.text).not.toMatch(/\.border-emerald-500\s*\{/)
    const order = styles.filter(entry => /\.mt-8\s*\{/.test(entry.text))
    expect(order).toHaveLength(1)
    expect(order[0]!.text).toMatch(/\.border-emerald-500\s*\{/)
    const scripts = await collectOutput('**/*.js', 'dist/build/h5')
    expect(scripts.some(entry => entry.text.includes(path.basename(order[0]!.file))), 'order CSS must remain referenced by the emitted module graph').toBe(true)
  }, 600_000)
})
