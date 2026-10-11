import { cva as cvaWeapp } from '@weapp-tailwindcss/cva'

import { twMerge as mergeWeapp } from '@weapp-tailwindcss/merge'
import { tv as tvWeapp } from '@weapp-tailwindcss/variants'
import { cva as cvaUpstream } from 'class-variance-authority'
import { twMerge as mergeUpstream } from 'tailwind-merge'
import { tv as tvUpstream } from 'tailwind-variants'
import { test } from 'vitest'

type MergeFn = (...classLists: string[]) => string

const SAMPLE_CLASSES: string[] = [
  'flex flex-col md:flex-row gap-3 md:gap-4',
  'px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
  'rounded-xl shadow-md shadow-blue-500/20 border border-blue-500/30 backdrop-blur',
  'grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 items-center',
  'text-[15px] leading-tight tracking-tight md:text-base',
  'dark:text-slate-100 dark:bg-slate-900',
  'ring-2 ring-offset-2 ring-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-400/70',
]

function benchTwMerge(fn: MergeFn) {
  for (const sample of SAMPLE_CLASSES) {
    fn(sample, 'text-blue-500', 'md:text-blue-600', 'hover:underline')
  }
}

const buttonOptions = {
  variants: {
    intent: {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
      outline: 'border border-indigo-500 text-indigo-600 hover:bg-indigo-50',
    },
    size: {
      sm: 'text-xs px-2.5 py-1.5 rounded',
      md: 'text-sm px-3 py-2 rounded-md',
      lg: 'text-base px-4 py-2.5 rounded-lg',
    },
  },
  defaultVariants: {
    intent: 'primary',
    size: 'md',
  },
} as const

const buttonUpstream = cvaUpstream('inline-flex items-center font-medium transition', buttonOptions)
const buttonWeapp = cvaWeapp('inline-flex items-center font-medium transition', buttonOptions)

const cardOptions = {
  slots: {
    base: 'rounded-xl shadow-lg border border-slate-200 p-4',
    header: 'flex items-center justify-between mb-3',
    title: 'text-lg font-semibold',
    body: 'space-y-3 text-sm text-slate-700',
  },
  variants: {
    tone: {
      neutral: {
        base: 'bg-white',
      },
      info: {
        base: 'bg-sky-50 border-sky-200 text-sky-900',
      },
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
} as const

const cardUpstream = tvUpstream(cardOptions)
const cardWeapp = tvWeapp(cardOptions)
const benchOptions = { time: 300 }

test('tailwindcss v4 merge benchmarks', async ({ bench }) => {
  await bench.compare(
    bench('tailwind-merge v3', () => benchTwMerge(mergeUpstream)),
    bench('@weapp-tailwindcss/merge', () => benchTwMerge(mergeWeapp)),
    benchOptions,
  )
})

test('tailwindcss v4 cva benchmarks', async ({ bench }) => {
  await bench.compare(
    bench(
      'class-variance-authority',
      () => {
        buttonUpstream({ intent: 'primary', size: 'md' })
      },
    ),
    bench(
      '@weapp-tailwindcss/cva',
      () => {
        buttonWeapp({ intent: 'primary', size: 'md' })
      },
    ),
    benchOptions,
  )
})

test('tailwindcss v4 variants benchmarks', async ({ bench }) => {
  await bench.compare(
    bench(
      'tailwind-variants',
      () => {
        cardUpstream({ tone: 'info' }).base()
      },
    ),
    bench(
      '@weapp-tailwindcss/variants',
      () => {
        cardWeapp({ tone: 'info' }).base()
      },
    ),
    benchOptions,
  )
})
