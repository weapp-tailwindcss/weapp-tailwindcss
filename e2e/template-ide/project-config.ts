import { readFile, writeFile } from 'node:fs/promises'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'

export async function withTemplateAppId<T>(file: string, appId: string | undefined, run: () => Promise<T>): Promise<T> {
  if (appId === undefined) {
    return run()
  }
  if (!/^wx[\da-f]{16}$/i.test(appId)) {
    throw new Error('E2E_TEMPLATE_IDE_APP_ID 必须是有效的小程序 AppID。')
  }
  const original = await readFile(file, 'utf8')
  const config = JSON.parse(original)
  const applied = `${JSON.stringify({ ...config, appid: appId }, null, 2)}\n`
  await writeFile(file, applied)
  async function restore() {
    if (await readFile(file, 'utf8') !== applied) {
      throw new Error(`模板 IDE 配置已被修改，保留现场：${file}`)
    }
    await writeFile(file, original)
  }
  return runWithCleanup(run, restore)
}
