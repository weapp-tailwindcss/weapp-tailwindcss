import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { diagnosticSymbol, mpxProject } from './constants.mjs'
import { prepareAllocationRoot } from './prepare.mjs'

/** 仅验证实际准备副本内的主包依赖链及 UI 消费链，不启动全面验收或性能 worker。 */
export async function verifyPreparationBuild(root, sourceRoot, evidenceDirectory) {
  root = await fs.realpath(root)
  evidenceDirectory = path.resolve(evidenceDirectory)
  assert.equal(globalThis[Symbol.for(diagnosticSymbol)], undefined, '准备构建不得预注册 observer')
  await prepareAllocationRoot(root, sourceRoot, evidenceDirectory, mpxProject)
  const commands = []
  async function pnpm(buildArguments, name) {
    // 输入副本须先准备好依赖；此回归不让 pnpm 在构建前再次安装或改写依赖。
    const args = ['--config.verify-deps-before-run=false', ...buildArguments]
    commands.push(['pnpm', ...args])
    const log = await fs.open(path.join(evidenceDirectory, `${name}.log`), 'w')
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
          cwd: root,
          env: { ...process.env, CI: '1' },
          shell: process.platform === 'win32',
          stdio: ['ignore', log.fd, log.fd],
        })
        child.once('error', reject)
        child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${name} 失败：${code ?? signal}；日志 ${path.join(evidenceDirectory, `${name}.log`)}`)))
      })
    }
    finally {
      await log.close()
      await fs.writeFile(path.join(evidenceDirectory, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`)
    }
  }
  await pnpm(['--filter', '@weapp-tailwindcss/ui^...', '--workspace-concurrency=2', 'run', 'build'], 'dependencies-build')
  const paths = []
  for (const [consumer, specifier, owner] of [
    ['packages-runtime/ui', 'weapp-tailwindcss/vite', 'packages/weapp-tailwindcss'],
    ['packages/weapp-tailwindcss', '@weapp-tailwindcss/engine', 'packages/engine'],
  ]) {
    const require = createRequire(path.join(root, consumer, 'package.json'))
    const resolved = await fs.realpath(require.resolve(specifier))
    const ownerRoot = await fs.realpath(path.join(root, owner))
    const relative = path.relative(ownerRoot, resolved)
    assert.ok(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative), `${specifier} 未解析到准备副本：${resolved}`)
    paths.push({ consumer, specifier, resolved })
  }
  await fs.writeFile(path.join(evidenceDirectory, 'resolved-paths.json'), `${JSON.stringify(paths, null, 2)}\n`)
  for (const owner of ['packages/weapp-tailwindcss', 'packages/engine']) {
    const dist = path.join(root, owner, 'dist')
    const contents = await Promise.all((await fs.readdir(dist)).filter(file => /\.(?:c?js|mjs)$/.test(file)).map(file => fs.readFile(path.join(dist, file), 'utf8')))
    assert.ok(contents.some(content => content.includes(diagnosticSymbol)), `${owner} 构建未包含插桩`)
  }
  await pnpm(['--filter', '@weapp-tailwindcss/ui', 'run', 'build'], 'ui-build')
  assert.ok((await fs.stat(path.join(root, 'packages-runtime/ui/dist/index.css'))).size > 0)
  return { root, commands, paths }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, sourceRoot, evidenceDirectory] = process.argv.slice(2)
  assert.ok(root && sourceRoot && evidenceDirectory, '用法：node verify-preparation-build.mjs <无 .git 准备副本> <源码工作树> <证据目录>')
  await verifyPreparationBuild(root, sourceRoot, evidenceDirectory)
}
