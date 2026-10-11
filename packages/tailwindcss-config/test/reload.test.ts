import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadConfig } from '../src'

it.each(['cjs', 'js', 'mjs', 'ts'])('重复读取 %s 配置时返回修改后的 content', async (extension) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'config-reload-'))
  try {
    const config = path.join(cwd, `tailwind.config.${extension}`)
    const prefix = extension === 'cjs' || extension === 'js' ? 'module.exports =' : 'export default'
    await fs.writeFile(config, `${prefix} { content: ["./first/**/*.qxml"] }`)
    const stat = await fs.stat(config)
    expect((await loadConfig({ cwd, config }))?.config.content).toEqual(['./first/**/*.qxml'])
    expect((await loadConfig({ cwd, config }))?.config.content).toEqual(['./first/**/*.qxml'])
    await fs.writeFile(config, `${prefix} { content: ["./other/**/*.qxml"] }`)
    await fs.utimes(config, stat.atime, stat.mtime)
    expect((await loadConfig({ cwd, config }))?.config.content).toEqual(['./other/**/*.qxml'])
  }
  finally {
    await fs.rm(cwd, { recursive: true, force: true })
  }
})

it.each(['cjs', 'mjs', 'ts'])('重新读取 %s 配置的间接依赖', async (extension) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'config-native-reload-'))
  try {
    const config = path.join(cwd, `tailwind.config.${extension}`)
    const helper = path.join(cwd, 'content.cjs')
    await fs.writeFile(helper, 'module.exports = ["./first/**/*.qxml"]')
    await fs.writeFile(config, extension === 'cjs'
      ? 'module.exports = { content: require("./content.cjs") }'
      : 'import content from "./content.cjs"; export default { content }')
    expect((await loadConfig({ cwd, config }))?.config.content).toEqual(['./first/**/*.qxml'])
    const stat = await fs.stat(helper)
    await fs.writeFile(helper, 'module.exports = ["./other/**/*.qxml"]')
    await fs.utimes(helper, stat.atime, stat.mtime)
    expect((await loadConfig({ cwd, config }))?.config.content).toEqual(['./other/**/*.qxml'])
  }
  finally {
    await fs.rm(cwd, { recursive: true, force: true })
  }
})
