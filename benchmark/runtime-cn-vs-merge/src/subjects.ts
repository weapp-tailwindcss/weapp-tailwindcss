export const SUBJECT_IDS = [
  'weapp-cn',
  'weapp-merge',
  'weapp-merge-slim',
  'weapp-merge-lite',
  'upstream-cn',
  'upstream-cn-twmerge',
  'upstream-twmerge',
  'upstream-twmerge-clsx',
] as const

export type SubjectId = (typeof SUBJECT_IDS)[number]

export type MergeFn = (...inputs: any[]) => string

export interface SubjectMeta {
  id: SubjectId
  label: string
  family: 'weapp' | 'upstream'
  joinOnly: boolean
  escaped: boolean
}

export const SUBJECTS: SubjectMeta[] = [
  {
    id: 'weapp-cn',
    label: '@weapp-tailwindcss/cn',
    family: 'weapp',
    joinOnly: false,
    escaped: true,
  },
  {
    id: 'weapp-merge',
    label: '@weapp-tailwindcss/merge',
    family: 'weapp',
    joinOnly: false,
    escaped: true,
  },
  {
    id: 'weapp-merge-slim',
    label: '@weapp-tailwindcss/merge/slim',
    family: 'weapp',
    joinOnly: false,
    escaped: true,
  },
  {
    id: 'weapp-merge-lite',
    label: '@weapp-tailwindcss/merge/lite (twJoin)',
    family: 'weapp',
    joinOnly: true,
    escaped: true,
  },
  {
    id: 'upstream-cn',
    label: 'cn() @0.3.0',
    family: 'upstream',
    joinOnly: false,
    escaped: false,
  },
  {
    id: 'upstream-cn-twmerge',
    label: 'cn.twMerge',
    family: 'upstream',
    joinOnly: false,
    escaped: false,
  },
  {
    id: 'upstream-twmerge',
    label: 'tailwind-merge twMerge',
    family: 'upstream',
    joinOnly: false,
    escaped: false,
  },
  {
    id: 'upstream-twmerge-clsx',
    label: 'twMerge(clsx(...))',
    family: 'upstream',
    joinOnly: false,
    escaped: false,
  },
]

export const WEAPP_SUBJECTS = SUBJECTS.filter(item => item.family === 'weapp')
export const UPSTREAM_SUBJECTS = SUBJECTS.filter(item => item.family === 'upstream')

export async function loadSubject(id: SubjectId): Promise<MergeFn> {
  switch (id) {
    case 'weapp-cn': {
      const { cn } = await import('@weapp-tailwindcss/cn')
      return cn
    }
    case 'weapp-merge': {
      const { twMerge } = await import('@weapp-tailwindcss/merge')
      return twMerge
    }
    case 'weapp-merge-slim': {
      const { twMerge } = await import('@weapp-tailwindcss/merge/slim')
      return twMerge
    }
    case 'weapp-merge-lite': {
      const { twJoin } = await import('@weapp-tailwindcss/merge/lite')
      return twJoin
    }
    case 'upstream-cn': {
      const { cn } = await import('cn')
      return cn
    }
    case 'upstream-cn-twmerge': {
      const { twMerge } = await import('cn')
      return twMerge
    }
    case 'upstream-twmerge': {
      const { twMerge } = await import('tailwind-merge')
      return twMerge
    }
    case 'upstream-twmerge-clsx': {
      const { twMerge } = await import('tailwind-merge')
      const { clsx } = await import('clsx')
      return (...inputs: any[]) => twMerge(clsx(inputs))
    }
  }
}
