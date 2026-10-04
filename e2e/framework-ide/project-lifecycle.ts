import fs from 'node:fs/promises'
import path from 'node:path'
import { closeWechatProject } from '../../scripts/wechat-project-cleanup'
import { withCleanup } from './cleanup'

export async function withFrameworkIdeProject<T, Client extends NonNullable<Parameters<typeof closeWechatProject>[1]>>(options: {
  projectPath: string
  closeTimeoutMs: number
  launch: () => Promise<Client>
  run: (client: Client) => Promise<T>
}) {
  const configPath = path.resolve(options.projectPath, 'project.config.json')
  let original: string | undefined
  try {
    original = await fs.readFile(configPath, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Failed to snapshot IDE project config ${configPath}: ${String(error)}`, { cause: error })
    }
  }
  let client: Client | undefined
  return withCleanup(async () => {
    client = await options.launch()
    return options.run(client)
  }, [
    {
      label: `Failed to close IDE project ${options.projectPath}`,
      run: () => closeWechatProject(options.projectPath, client, options.closeTimeoutMs),
    },
    {
      label: `Failed to restore IDE project config ${configPath}`,
      run: async () => {
        if (original != null) {
          await fs.writeFile(configPath, original)
        }
      },
    },
  ])
}
