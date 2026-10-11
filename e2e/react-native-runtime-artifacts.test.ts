import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createRuntimeArtifacts } from './react-native/runtime-artifacts'

it('keeps live Metro evidence outside the workspace and publishes the complete session after shutdown', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-workspace-'))
  const destination = path.join(workspace, 'e2e', '.artifacts', 'native')
  const session = await createRuntimeArtifacts(destination)
  try {
    expect(path.relative(workspace, session.directory).split(path.sep)[0]).toBe('..')
    await fs.writeFile(path.join(session.directory, 'metro.log'), 'fresh runtime')
    await fs.writeFile(path.join(session.directory, 'failure.png'), new Uint8Array([1, 2, 3]))
    await expect(fs.access(destination)).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.mkdir(destination, { recursive: true })
    await fs.writeFile(path.join(destination, 'old.png'), 'old')
    await session.publish()
    expect(await fs.readdir(destination)).toEqual(['failure.png', 'metro.log'])
    expect(await fs.readFile(path.join(destination, 'metro.log'), 'utf8')).toBe('fresh runtime')
    await expect(fs.access(session.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally {
    await fs.rm(workspace, { recursive: true, force: true })
    await fs.rm(session.directory, { recursive: true, force: true })
  }
})
