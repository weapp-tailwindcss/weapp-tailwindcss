import { access, readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

export async function hbuilderxTools(cli: string) {
  const candidates = [path.join(path.dirname(cli), 'plugins'), path.resolve(path.dirname(cli), '..', 'HBuilderX', 'plugins')]
  const roots: string[] = []
  for (const candidate of candidates) {
    if (await access(candidate).then(() => true, () => false)) {
      roots.push(candidate)
    }
  }
  if (roots.length !== 1) {
    throw new Error(`无法确定所选 HBuilderX 的插件目录：${candidates.join(', ')}`)
  }
  const root = roots[0]!
  const versions: Record<string, string> = {}
  for (const name of ['uniapp-cli-vite', 'uniapp-uts-v1', 'launcher', 'launcher-harmony', 'uniappx-launcher', 'uts-development-android']) {
    const dir = path.join(root, name)
    const manifest = path.join(dir, 'package.json')
    const pkg = JSON.parse(await readFile(manifest, 'utf8'))
    if (pkg.name !== name || !pkg.version) {
      throw new Error(`HBuilderX 必需组件身份不完整：${manifest}`)
    }
    if (pkg.main) {
      await access(path.resolve(dir, pkg.main))
    }
    if (name.includes('launcher') && !(await readdir(path.join(dir, 'base'))).length) {
      throw new Error(`HBuilderX 运行基座缺失：${dir}`)
    }
    if (name === 'uniapp-uts-v1') {
      const require = createRequire(manifest)
      for (const module of ['@dcloudio/uni-uts-v1', '@dcloudio/uts']) {
        await access(require.resolve(module))
      }
    }
    versions[name] = String(pkg.version)
  }
  return { plugins: root, toolchains: JSON.stringify(versions) }
}
