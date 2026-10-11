import path from 'node:path'
import fs from 'node:fs/promises'
import { expect } from 'vitest'
import { sourceGenerationContract } from '../../test-helper/src/source-generation-contract'
import { runCli } from './parity-harness'
sourceGenerationContract('CLI', {
  async generate(root, css) {
    await fs.writeFile(path.join(root, 'input.css'), css)
    const result = await runCli(root, ['-i', 'input.css', '--silent'])
    return { css: result.stdout }
  },
}, expect, path.resolve(__dirname, '../../..'))
