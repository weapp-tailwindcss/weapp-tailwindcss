import { test } from 'vitest'

import { escape } from '../src/escape'
import { COMPLEX_ESCAPE_MAPPING } from '../src/mapping'
import { unescape } from '../src/unescape'

const shortSelector = 'btn-primary/active#icon[data-state=open]'
const repeatedSelector = Array.from({ length: 32 }, () => shortSelector).join(' ')

const escapedRepeatedDefault = escape(repeatedSelector)
const escapedRepeatedComplex = escape(repeatedSelector, { map: COMPLEX_ESCAPE_MAPPING })

test('escape benchmarks', async ({ bench }) => {
  await bench.compare(
    bench('escape short selector (default map)', () => {
      escape(shortSelector)
    }),

    bench('escape long selector (default map)', () => {
      escape(repeatedSelector)
    }),

    bench('escape long selector (complex map)', () => {
      escape(repeatedSelector, { map: COMPLEX_ESCAPE_MAPPING })
    }),

    bench('unescape long selector (default map)', () => {
      unescape(escapedRepeatedDefault)
    }),

    bench('unescape long selector (complex map)', () => {
      unescape(escapedRepeatedComplex, { map: COMPLEX_ESCAPE_MAPPING })
    }),
  )
})
