import { afterEach, describe, expect, test } from 'vitest'
import { createCliFixture, retryAssertion, runCli, runCliFailure, spawnCli } from './parity-harness'

const fixtures: Array<{ cleanup: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.cleanup()))
})

async function fixture(files: Record<string, string>) {
  const result = await createCliFixture(files)
  fixtures.push(result)
  return result
}

const inputCss = `@import "tailwindcss" source(none);\n@source inline("flex p-4 hover:underline");\n`

describe('Tailwind CLI build parity', () => {
  test('prints the package version', async () => {
    const project = await fixture({})
    const { stdout } = await runCli(project.root, ['--version'])
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
    expect(stdout.trim()).not.toBe('0.0.0')
  })

  test('builds to a file with the root command and build alias', async () => {
    const project = await fixture({ 'src/input.css': inputCss })
    await runCli(project.root, ['-i', 'src/input.css', '-o', 'dist/root.css', '--silent'])
    await runCli(project.root, ['build', '--input', 'src/input.css', '--output', 'dist/build.css', '--silent'])
    expect(await project.read('dist/root.css')).toContain('.p-4')
    expect(await project.read('dist/build.css')).toContain('.hover\\:underline:hover')
  })

  test('reads stdin and writes stdout', async () => {
    const project = await fixture({})
    const { stdout } = await runCli(project.root, ['--input', '-', '--output', '-', '--silent'], inputCss)
    expect(stdout).toContain('.flex')
    expect(stdout).toContain('.p-4')
  })

  test('exits watch on stdin EOF unless --watch=always is used', async () => {
    const project = await fixture({})
    const result = await runCli(project.root, ['--input', '-', '--watch', '--silent'], inputCss)
    expect(result.stdout).toContain('.flex')
  })

  test('uses the default Tailwind input when input is omitted', async () => {
    const project = await fixture({ 'index.html': '<div class="underline"></div>' })
    await runCli(project.root, ['--output', 'out.css', '--silent'])
    expect(await project.read('out.css')).toContain('.underline')
  })

  test.each([
    ['--minify'],
    ['--optimize'],
  ])('supports %s', async (flag) => {
    const project = await fixture({ 'input.css': inputCss })
    await runCli(project.root, ['-i', 'input.css', '-o', 'out.css', flag, '--silent'])
    const css = await project.read('out.css')
    expect(css).toContain('.p-4')
    expect(css.length).toBeLessThan(10_000)
  })

  test('generates inline and external source maps', async () => {
    const project = await fixture({ 'src/input.css': inputCss })
    await runCli(project.root, ['-i', 'src/input.css', '-o', 'dist/inline.css', '--map', '--silent'])
    await runCli(project.root, ['-i', 'src/input.css', '-o', 'dist/external.css', '--map', 'dist/external.css.map', '--silent'])
    expect(await project.read('dist/inline.css')).toContain('sourceMappingURL=data:application/json')
    expect(JSON.parse(await project.read('dist/external.css.map')).version).toBe(3)
  })

  test('resolves input and output from --cwd', async () => {
    const project = await fixture({ 'app/input.css': inputCss })
    await runCli(project.root, ['--cwd', 'app', '-i', 'input.css', '-o', 'dist/out.css', '--silent'])
    expect(await project.read('app/dist/out.css')).toContain('.p-4')
  })

  test('suppresses the banner with --silent', async () => {
    const project = await fixture({ 'input.css': inputCss })
    const loud = await runCli(project.root, ['-i', 'input.css', '-o', 'loud.css'])
    const silent = await runCli(project.root, ['-i', 'input.css', '-o', 'silent.css', '--silent'])
    expect(loud.stderr).toContain('tailwindcss')
    expect(silent.stderr).toBe('')
  })

  test.each([
    [['--input', 'missing.css'], 'does not exist'],
    [['--input', 'input.css', '--output', 'input.css'], 'identical'],
    [['--watch', '--poll=0'], 'positive number'],
    [['--map=-'], 'without a value'],
  ] as const)('reports invalid build arguments: %j', async (args, message) => {
    const project = await fixture({ 'input.css': inputCss })
    const error = await runCliFailure(project.root, [...args, '--silent'])
    expect(error.stderr).toContain(message)
  })

  test('rebuilds in watch and poll mode', async () => {
    const project = await fixture({
      'input.css': '@import "tailwindcss" source(none);\n@source "./index.html";\n',
      'index.html': '<div class="flex"></div>',
    })
    const child = spawnCli(project.root, ['-i', 'input.css', '-o', 'out.css', '--watch', '--poll=50', '--silent'])
    try {
      await retryAssertion(async () => expect(await project.read('out.css')).toContain('.flex'))
      await project.write('index.html', '<div class="grid"></div>')
      await retryAssertion(async () => expect(await project.read('out.css')).toContain('.grid'))
    }
    finally {
      child.kill('SIGTERM')
    }
  })

  test('rebuilds after repeated idle periods in native watch mode', async () => {
    const project = await fixture({
      'input.css': '@import "tailwindcss" source(none);\n@source "./index.html";\n',
      'index.html': '<div class="flex"></div>',
    })
    const child = spawnCli(project.root, ['-i', 'input.css', '-o', 'out.css', '--watch', '--silent'])
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    try {
      await retryAssertion(async () => expect(await project.read('out.css')).toContain('.flex'))
      for (const candidate of ['grid', 'underline', 'block']) {
        await project.write('index.html', `<div class="${candidate}"></div>`)
        await retryAssertion(async () => expect(await project.read('out.css')).toContain(`.${candidate}`))
      }
      expect(stderr).not.toContain('falling back to polling')
    }
    finally {
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
      child.kill('SIGTERM')
      await exited
    }
  })

  test('converts CSS only when --target weapp is explicit', async () => {
    const project = await fixture({ 'input.css': inputCss })
    await runCli(project.root, ['-i', 'input.css', '-o', 'web.css', '--target', 'web', '--silent'])
    await runCli(project.root, ['-i', 'input.css', '-o', 'weapp.css', '--target=weapp', '--silent'])
    expect(await project.read('web.css')).toContain('.hover\\:underline:hover')
    expect(await project.read('weapp.css')).not.toContain('.hover\\:underline:hover')
    expect(await project.read('weapp.css')).toContain('.p-4')
  })

  test('rejects source maps for transformed weapp CSS', async () => {
    const project = await fixture({ 'input.css': inputCss })
    const error = await runCliFailure(project.root, ['-i', 'input.css', '--target', 'weapp', '--map'])
    expect(error.stderr).toContain('only supported when "--target web"')
  })

  test('rejects identical input and output paths in weapp mode', async () => {
    const project = await fixture({ 'input.css': inputCss })
    const error = await runCliFailure(project.root, [
      '--input',
      './input.css',
      '--output',
      'nested/../input.css',
      '--target',
      'weapp',
    ])
    expect(error.stderr).toContain('identical')
  })

  test('updates transformed CSS while watching in weapp mode', async () => {
    const project = await fixture({
      'input.css': '@import "tailwindcss" source(none);\n@source "./index.html";\n',
      'index.html': '<div class="flex"></div>',
    })
    const child = spawnCli(project.root, ['-i', 'input.css', '-o', 'out.wxss', '--target', 'weapp', '--watch', '--poll=50', '--silent'])
    try {
      await retryAssertion(async () => expect(await project.read('out.wxss')).toContain('.flex'))
      await project.write('index.html', '<div class="grid"></div>')
      await retryAssertion(async () => expect(await project.read('out.wxss')).toContain('.grid'))
    }
    finally {
      child.kill('SIGTERM')
    }
  })
})
