import fs from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'

export async function linkPortableDecoder(python: string, emsdk: string, directory: string, environment: NodeJS.ProcessEnv) {
  const emscripten = path.join(emsdk, 'upstream', 'emscripten')
  const archive = path.join(directory, 'liblepus.a')
  const run = (script: string, args: string[]) => execa(python, [path.join(emscripten, script), ...args], { cwd: directory, env: environment, stdio: 'inherit' })
  // 复现上游 gen_wasm_js.py 的归档与链接步骤，以 argv/fs 避免 shell 通配符和路径引用差异。
  await run('emar.py', ['x', archive])
  const objects = (await fs.readdir(directory)).filter(file => file.endsWith('.o')).sort()
  if (!objects.length) { throw new Error('WASM 完整归档未生成目标文件') }
  await run('emar.py', ['qc', archive, ...objects])
  await run('emranlib.py', [archive])
  await Promise.all(objects.map(file => fs.unlink(path.join(directory, file))))
  await run('emcc.py', [
    '--bind',
    archive,
    '-o',
    path.join(directory, 'lepus.js'),
    '--emit-tsd',
    path.join(directory, 'lepus.d.ts'),
    '-g',
    '-s',
    'WASM=1',
    '-s',
    'ERROR_ON_UNDEFINED_SYMBOLS=0',
    '-s',
    'WASM_ASYNC_COMPILATION=0',
    '-s',
    'ASSERTIONS=0',
    '-s',
    'NODEJS_CATCH_EXIT=0',
    '-s',
    'NODEJS_CATCH_REJECTION=0',
    '-s',
    'DISABLE_EXCEPTION_CATCHING=0',
    '-s',
    'SINGLE_FILE=1',
    '-s',
    'MAXIMUM_MEMORY=4294967296',
    '-s',
    'ALLOW_MEMORY_GROWTH=1',
    '-s',
    'MODULARIZE=1',
    '-s',
    'EXPORTED_RUNTIME_METHODS=[\'cwrap\',\'ccall\',\'allocateUTF8\',\'UTF8ToString\',\'HEAPU8\']',
    '-s',
    'EXPORTED_FUNCTIONS=[\'_quickjsCheck\',\'_reencode_template_debug\',\'_lepusCheck\',\'_createBufferPool\',\'_dropBufferPool\',\'_readBufferPool_data\',\'_readBufferPool_len\',\'_malloc\',\'_free\']',
  ])
  return path.join(directory, 'lepus.js')
}
