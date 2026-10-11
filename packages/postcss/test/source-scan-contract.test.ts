import { expect } from 'vitest'
import { sourceFilesContract } from '../../test-helper/src/source-files-contract'
import { expandTailwindSourceEntries } from '../src/source-scan'
import { sourceScanContract } from '../../test-helper/src/source-scan-contract'
import { isFileMatchedByTailwindSourceEntries, resolveTailwindSourceEntry } from '../src/source-scan'

sourceScanContract('postcss', { matches: isFileMatchedByTailwindSourceEntries, resolveEntry: resolveTailwindSourceEntry }, expect)
sourceFilesContract('postcss', expandTailwindSourceEntries, expect)
