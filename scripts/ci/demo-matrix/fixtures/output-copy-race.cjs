const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

async function main() {
  const { snapshotOutput } = await import('../snapshot.mjs')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'output-copy-race-'))
  const output = path.join(directory, 'dist')
  const evidence = path.join(directory, 'evidence')
  const source = path.join(output, 'bundle.js')
  const destination = path.join(evidence, 'bundle.js')
  try {
    await fs.mkdir(output)
    await fs.mkdir(evidence)
    await fs.writeFile(source, Buffer.alloc(32 * 1024 * 1024, 65))
    await race('copyFile', () => fs.copyFile(source, destination))
    const result = await race('snapshot', () => snapshotOutput(output, evidence))
    assert.equal(result.errors.length, 0, '证据读取不得使编译器写入失败')
    assert.ok(result.attempts > 0)
    assert.deepEqual(await fs.readFile(destination), await fs.readFile(source))
  }
  finally { await fs.rm(directory, { recursive: true, force: true }) }

  async function race(method, copyOutput) {
    const errors = []
    let attempts = 0
    for (let round = 0; round < 10; round++) {
      const state = { copying: true }
      const copy = copyOutput()
        .catch(error => errors.push({ operation: 'copy', code: error.code }))
        .finally(() => { state.copying = false })
      while (state.copying) {
        attempts++
        let file
        try {
          file = await fs.open(source, 'r+')
          await file.write(Buffer.from('A'), 0, 1, 0)
        }
        catch (error) { errors.push({ operation: 'write', code: error.code }) }
        finally { await file?.close() }
      }
      await copy
    }
    const counts = {}
    for (const error of errors) {
      const key = `${error.operation}:${error.code}`
      counts[key] = (counts[key] ?? 0) + 1
    }
    console.log(JSON.stringify({ platform: process.platform, method, attempts, errors: counts }))
    return { attempts, errors }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
