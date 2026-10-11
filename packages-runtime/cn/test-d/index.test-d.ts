import type { ClassValue } from '..'
import { expectType } from 'tsd'
import { cn } from '..'

const value: ClassValue = ['p-4', { hidden: false }]
expectType<string>(cn(value, 'text-sm'))
