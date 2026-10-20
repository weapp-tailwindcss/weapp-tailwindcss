import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { sha256 } from './archives'

interface ToolchainInputs {
  emsdkScriptSha256: string
  emscriptenVersion: string
  compilerCommit: string
  toolchain: {
    emscriptenCommit: string
    llvmCommit: string
    emccScriptSha256: string
    clang: Record<string, { byteLength: number, sha256: string }>
  }
}

/** 同时核实际编译器、安装 receipt 和脚本身份，版本文本不能独立证明工具链。 */
export async function verifyToolchain(emsdk: string, python: string, inputs: ToolchainInputs, environment: NodeJS.ProcessEnv) {
  if (sha256(await fs.readFile(path.join(emsdk, 'emsdk.py'))) !== inputs.emsdkScriptSha256) {
    throw new Error('emsdk.py 与固定 SDK commit 不匹配')
  }
  const version = JSON.parse(await fs.readFile(path.join(emsdk, 'upstream', 'emscripten', 'emscripten-version.txt'), 'utf8'))
  const receipt = (await fs.readFile(path.join(emsdk, 'upstream', '.emsdk_version'), 'utf8')).trim()
  if (version !== inputs.emscriptenVersion || receipt !== `releases-${inputs.compilerCommit}-64bit`) {
    throw new Error('Emscripten 版本或编译器安装 receipt 不匹配')
  }
  const emcc = path.join(emsdk, 'upstream', 'emscripten', 'emcc.py')
  const emccSha256 = sha256(await fs.readFile(emcc))
  if (emccSha256 !== inputs.toolchain.emccScriptSha256) {
    throw new Error('实际 emcc.py 的 SHA-256 不匹配')
  }
  const clang = path.join(emsdk, 'upstream', 'bin', process.platform === 'win32' ? 'clang.exe' : 'clang')
  const bytes = await fs.readFile(clang)
  const clangSha256 = sha256(bytes)
  const expectedClang = inputs.toolchain.clang[`${process.platform}-${process.arch}`]
  if (expectedClang && (bytes.length !== expectedClang.byteLength || clangSha256 !== expectedClang.sha256)) {
    throw new Error('实际 clang 的字节身份不匹配')
  }
  const emccVersion = (await execa(python, [emcc, '--version'], { env: environment })).stdout.split('\n')[0]!
  const clangVersion = (await execa(clang, ['--version'], { env: environment })).stdout.split('\n')[0]!
  if (!emccVersion.includes(inputs.emscriptenVersion) || !emccVersion.includes(inputs.toolchain.emscriptenCommit) || !clangVersion.includes(inputs.toolchain.llvmCommit)) {
    throw new Error('实际 emcc/clang 版本与固定 commit 不匹配')
  }
  return { receipt, emccVersion, emccSha256, clangVersion, clangSha256, clangByteLength: bytes.length, registeredClangDigest: Boolean(expectedClang) }
}
