import path from 'node:path'
import { expect } from 'vitest'
import { sourceFilesContract } from '../../test-helper/src/source-files-contract'
import { resolveProjectSourceFiles } from '../src'
import { sourceScanContract } from '../../test-helper/src/source-scan-contract'
import { isFileMatchedByTailwindV4SourceEntries, resolveTailwindV4SourceEntry } from '../src/v4/source-scan'

sourceScanContract('engine', { matches: isFileMatchedByTailwindV4SourceEntries, resolveEntry: resolveTailwindV4SourceEntry }, expect)
sourceFilesContract('engine', sources => resolveProjectSourceFiles({ sources }), expect)

import { sourceGenerationContract } from '../../test-helper/src/source-generation-contract'
import { createTailwindGenerationSession, resolveTailwindV4Source } from '../src/v4'
sourceGenerationContract('engine', {
  async generate(root, css) {
    const engine = createTailwindGenerationSession(await resolveTailwindV4Source({ base: root, projectRoot: root, css }))
    try {
      const result = await engine.generate({ scanSources: true, excludeFiles: [] })
      return { css: result.fragments.map(fragment => fragment.root.toString()).join('\n'), classSet: result.classSet }
    }
    finally { engine.dispose() }
  },
}, expect, path.resolve(__dirname, '../../..'))
