import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import ts from 'typescript'
import { expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

it('独立 Node 编译入口的真实声明不依赖可选 React Native peer', async () => {
  await execa('pnpm', ['--filter', '@weapp-tailwindcss/react-native', 'build'], { cwd: repoRoot })
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-node-types-'))
  try {
    await fs.cp(path.join(repoRoot, 'packages/react-native/dist'), path.join(root, 'package'), { recursive: true })
    await fs.mkdir(path.join(root, 'node_modules/@weapp-tailwindcss'), { recursive: true })
    for (const [name, source] of [['@weapp-tailwindcss/postcss', 'postcss'], ['weapp-tailwindcss', 'weapp-tailwindcss']]) {
      await fs.symlink(path.join(repoRoot, 'packages', source!), path.join(root, 'node_modules', name!), 'junction')
    }
    const file = path.join(root, 'consumer.ts')
    await fs.writeFile(file, `
      import { compileNativeStylesheet } from './package/compiler.js'
      import { generateNativeStylesheet } from './package/tailwind.js'
      import { getRegisteredSnapshot, withWeappTailwindcss } from './package/metro.js'
      const manifest = compileNativeStylesheet('.flex { display: flex }')
      const config = withWeappTailwindcss({}, { manifest })
      const generation = generateNativeStylesheet({ css: '.flex { display: flex }' })
      getRegisteredSnapshot('node-entry').then(snapshot => {
        const identity: { revision: string, manifestSha256: string } | undefined = snapshot?.publication
        void identity
      })
      void [config, generation]
    `)
    const program = ts.createProgram([file], {
      noEmit: true,
      strict: true,
      skipLibCheck: false,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: ['node'],
      typeRoots: [path.join(repoRoot, 'node_modules/@types')],
    })
    expect(ts.getPreEmitDiagnostics(program).map(item => ({ file: item.file?.fileName, message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }))).toEqual([])
    expect(ts.resolveModuleName('react-native', file, program.getCompilerOptions(), ts.sys).resolvedModule).toBeUndefined()
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 60_000)

it.each(['js', 'cjs'])('构建后的 %s 根入口与 runtime 共享默认发布实例，独立实例保持隔离', async (extension) => {
  await execa('pnpm', ['--filter', '@weapp-tailwindcss/react-native', 'build'], { cwd: repoRoot })
  const { stdout } = await execa(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const require = createRequire(import.meta.url);
    const load = filename => ${JSON.stringify(extension)} === 'cjs' ? require(filename) : import(pathToFileURL(filename).href);
    const base = ${JSON.stringify(path.join(repoRoot, 'packages/react-native/dist'))};
    const { join } = await import('node:path');
    const root = await load(join(base, 'index.${extension}'));
    const runtime = await load(join(base, 'runtime.${extension}'));
    const compiler = await load(join(base, 'compiler.${extension}'));
    const red = compiler.compileNativeStylesheet('.probe { color: red }');
    const identity = { revision: 'built-consumer', manifestSha256: 'a'.repeat(64) };
    root.setManifest(red, identity);
    assert.deepEqual(runtime.getPublication(), identity);
    assert.deepEqual(runtime.tw('probe'), { color: 'red' });
    const isolated = runtime.createNativeStyleRuntime(compiler.compileNativeStylesheet('.probe { color: blue }'));
    assert.deepEqual(isolated.tw('probe'), { color: 'blue' });
    assert.deepEqual(root.getManifest(), JSON.parse(JSON.stringify(red)));
    runtime.setManifest(red);
    assert.equal(root.getPublication(), undefined);
    process.stdout.write('publication-consumer-ok');
  `], { cwd: repoRoot })
  expect(stdout).toBe('publication-consumer-ok')
}, 60_000)
