import { expect } from 'vitest'
import { sourceScanContract } from '../../test-helper/src/source-scan-contract'
import { isFileMatchedByTailwindSourceEntries, resolveTailwindSourceEntry } from '../src'

sourceScanContract('source-scan', { matches: isFileMatchedByTailwindSourceEntries, resolveEntry: resolveTailwindSourceEntry }, expect)
