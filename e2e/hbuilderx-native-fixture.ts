import fs from 'node:fs/promises'
import path from 'node:path'

/** 所有持久登记只写测试临时仓库，不能触及真实 Git 或用户安装。 */
export async function prepareNativeFixture(root: string) {
  await fs.mkdir(path.join(root, '.git'), { recursive: true })
  const cli = path.join(root, 'test-cli')
  await fs.writeFile(cli, 'test installation')
  return { path: cli, host: 'test-host', version: '5.31.2026093020-alpha' }
}
