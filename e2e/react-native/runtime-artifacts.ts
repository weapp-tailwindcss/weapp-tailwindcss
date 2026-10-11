import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Metro 运行期间不向 workspace 写证据，避免日志和截图触发额外刷新。 */
export async function createRuntimeArtifacts(destination: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tailwindcss-rn-evidence-'))
  return {
    directory,
    async publish() {
      await fs.rm(destination, { recursive: true, force: true })
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.cp(directory, destination, { recursive: true, preserveTimestamps: true })
      // 归档成功后才清除临时证据，复制失败时保留诊断材料。
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}
