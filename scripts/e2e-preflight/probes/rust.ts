import type { ProbeContext } from '../types'
import { constants } from 'node:fs'
import { access, readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { satisfies } from 'semver'
import { hostNativeTarget } from '../../../packages/weapp-tailwindcss/native/targets.mjs'
import { assertRuntimePath, assertRuntimeSearchPath, executableCandidates } from './runtime-command'

/** rustup 代理依赖可执行文件名，解析身份时保留 cargo/rustc 入口，不能改用 realpath 调用 rustup。 */
export async function rustCommand(file: string, args: string[], cwd: string) {
  assertRuntimePath(file, 'Rust 工具', process.platform, true)
  assertRuntimeSearchPath(file, process.env)
  for (const command of executableCandidates(file, process.env, cwd)) {
    if (!await stat(command).then(item => item.isFile(), () => false)
      || !await access(command, constants.X_OK).then(() => true, () => false)) {
      continue
    }
    const result = await execa(command, args, { cwd, all: true, timeout: 10_000, forceKillAfterDelay: 1000, windowsHide: true })
    return { command, executable: await realpath(command), output: (result.all ?? '').trim() }
  }
  throw new Error(`Rust 工具不可执行：${file}；请准备已安装工具后重新 prepare --extended。`)
}

export async function rustToolchain(ctx: ProbeContext) {
  const target = hostNativeTarget()
  const kernels: Record<string, unknown> = {}
  for (const name of ['weapp-tailwindcss', 'postcss']) {
    const cwd = path.join(ctx.root, 'packages', name, 'native')
    const manifest = await readFile(path.join(cwd, 'Cargo.toml'), 'utf8')
    const minimum = /^rust-version\s*=\s*"([^"]+)"/m.exec(manifest)?.[1]
    const rustc = process.env['RUSTC'] ?? process.env['CARGO_BUILD_RUSTC'] ?? 'rustc'
    const compiler = await rustCommand(rustc, ['--version'], cwd)
    const version = /^rustc (\d+\.\d+\.\d+(?:-[\w.]+)?)/.exec(compiler.output)?.[1]
    if (!version || (minimum && !satisfies(version, `>=${minimum}`, { includePrerelease: true }))) {
      throw new Error(`${name} 需要 Rust ${minimum ?? '有效版本'} 以上；实际 ${compiler.output}`)
    }
    const cargo = await rustCommand('cargo', ['--version'], cwd)
    const clippy = await rustCommand('cargo', ['clippy', '--version'], cwd)
    if (!/^cargo \d+\.\d+/.test(cargo.output) || !/^clippy \d+\.\d+/.test(clippy.output)) {
      throw new Error(`${name} 未取得有效 cargo/Clippy 版本。`)
    }
    const library = await rustCommand(rustc, ['--print', 'target-libdir', '--target', target], cwd)
    if (!path.isAbsolute(library.output)) {
      throw new Error(`Rust target 标准库路径无效：${library.output}`)
    }
    const files = await readdir(library.output).catch((cause) => {
      throw new Error(`Rust target ${target} 标准库缺失；不自动安装。`, { cause })
    })
    if (!files.some(file => /^libstd-.+\.rlib$/.test(file)) || !files.some(file => /^libcore-.+\.rlib$/.test(file))) {
      throw new Error(`Rust target ${target} 缺少 std/core 标准库。`)
    }
    kernels[name] = { compiler, cargo, clippy, library: await realpath(library.output) }
  }
  return { nativeTarget: target, rustToolchain: JSON.stringify(kernels) }
}
