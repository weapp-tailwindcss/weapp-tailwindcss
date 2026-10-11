import { expect } from 'vitest'
import { sourceFilesContract } from '../../../test-helper/src/source-files-contract'
import { expandTailwindSourceEntries } from '@/tailwindcss/source-scan'
import { sourceScanContract } from '../../../test-helper/src/source-scan-contract'
import { isFileMatchedByTailwindSourceEntries, resolveTailwindSourceEntry } from '@/tailwindcss/source-scan'

sourceScanContract('core', { matches: isFileMatchedByTailwindSourceEntries, resolveEntry: resolveTailwindSourceEntry }, expect)
sourceFilesContract('core', expandTailwindSourceEntries, expect)
