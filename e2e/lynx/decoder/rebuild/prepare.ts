import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { downloadArchive, sha256, unpackArchive } from './archives'

export async function prepareSources(directory: string, decoderRoot: string, cache?: string, patchRoot = decoderRoot) {
  const inputs = JSON.parse(await fs.readFile(path.join(decoderRoot, 'rebuild', 'inputs.json'), 'utf8'))
  const bootstrap = JSON.parse(await fs.readFile(path.join(decoderRoot, 'rebuild', 'bootstrap-inputs.json'), 'utf8'))
  inputs.toolchain = bootstrap.toolchain
  const downloads = path.join(directory, 'downloads')
  for (const input of [...inputs.archives, ...bootstrap.archives]) {
    if (input.file === 'emsdk.tar.gz') {
      continue
    }
    const archive = await downloadArchive(input, downloads, cache)
    await unpackArchive(archive, path.join(directory, ...input.destination), input.strip)
  }
  const source = path.join(directory, 'source')
  for (const patch of inputs.patches) {
    const file = path.resolve(patchRoot, patch.file)
    if (sha256(await fs.readFile(file)) !== patch.sha256) {
      throw new Error(`补丁 SHA-256 不匹配: ${patch.file}`)
    }
    await execa('git', ['apply', '--check', file], { cwd: source })
    await execa('git', ['apply', file], { cwd: source })
  }
  for (const file of ['0001-add-new-modp_b64-APIs.patch', '0002-optimize-rename-modp-method-with-lynx-prefix.patch']) {
    await execa('git', ['apply', path.join(source, 'patches', 'modp_b64', file)], { cwd: path.join(source, 'third_party', 'modp_b64') })
  }
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  const arch = process.arch === 'x64' ? 'x86_64' : process.arch
  const gn = inputs.gn[`${platform}-${arch}`]
  if (!gn) {
    throw new Error(`上游 GN 未登记该平台: ${platform}-${arch}`)
  }
  await unpackArchive(await downloadArchive(gn, downloads, cache), path.join(directory, ...gn.destination), gn.strip)
  return { source, inputs }
}
