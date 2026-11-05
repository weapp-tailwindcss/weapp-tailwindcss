import type { TV, TVConfig, TWMConfig, VariantProps } from '..'
import {
  expectAssignable,
  expectError,
  expectNotAssignable,
  expectType,
} from 'tsd'
import {
  cn,
  cnBase,
  create,
  createTV,
  tv,
} from '..'

expectType<string>(cnBase('px-2', false))
expectType<string>(cn('px-2', undefined)())
expectType<string>(cnBase())
expectType<string>(cn()())

const button = tv({
  base: 'inline-flex',
  variants: {
    intent: {
      primary: 'bg-blue-500',
      secondary: 'bg-gray-500',
    },
    size: {
      sm: 'text-sm',
      lg: 'text-lg',
    },
    rounded: {
      true: 'rounded-full',
      false: 'rounded-none',
    },
  },
  defaultVariants: {
    size: 'sm',
  },
})

expectType<string>(button())
expectType<string>(button({ class: 'px-2' }))
expectError(button({ class: 'px-2', className: 'py-2' }))
expectError(button({ intent: 'tertiary' }))
expectError(button({ rounded: 'true' }))
expectError(button({ size: 'xl' }))

type ButtonVariantProps = VariantProps<typeof button>
const buttonVariantProps: ButtonVariantProps = {
  intent: 'secondary',
  rounded: false,
}

expectType<{
  intent?: 'primary' | 'secondary' | undefined
  size?: 'sm' | 'lg' | undefined
  rounded?: boolean | undefined
}>(buttonVariantProps)
expectNotAssignable<ButtonVariantProps>({ class: 'px-2' })
expectNotAssignable<ButtonVariantProps>({ className: 'py-2' })

const baseButton = tv({
  variants: {
    tone: {
      solid: 'bg-black',
      soft: 'bg-gray-200',
    },
  },
})

const extendedButton = tv({
  extend: baseButton,
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg',
    },
  },
})

type ExtendedButtonProps = VariantProps<typeof extendedButton>
expectAssignable<ExtendedButtonProps>({ tone: 'solid', size: 'sm' })
expectError(extendedButton({ tone: 'ghost' }))

const card = tv({
  base: 'card',
  slots: {
    root: 'card-root',
    icon: 'card-icon',
  },
  variants: {
    size: {
      sm: { root: 'text-sm', icon: 'h-4' },
      lg: { root: 'text-lg', icon: 'h-6' },
    },
  },
})

const cardSlots = card({ size: 'sm' })
expectType<string>(cardSlots.base())
expectType<string>(cardSlots.root())
expectType<string>(cardSlots.icon())
expectType<string>(cardSlots.root({ size: 'lg' }))
expectError(cardSlots.root({ size: 'xl' }))

const createFactory = createTV({ twMerge: false })
const createButton = createFactory({
  variants: {
    tone: {
      solid: 'bg-black',
      soft: 'bg-gray-200',
    },
  },
})

type CreateButtonProps = VariantProps<typeof createButton>
expectAssignable<CreateButtonProps>({ tone: 'solid' })
expectError(createButton({ tone: 'ghost' }))

const runtime = create({
  twMergeConfig: {
    extend: {
      classGroups: {
        'font-size': [{ text: ['32'] }],
      },
    },
  },
})

expectType<string>(runtime.cn('text-32', 'text-surface-700')())

const runtimeWithOptions = create({ escape: false }, { twMerge: false })
expectType<string>(runtimeWithOptions.cn('px-2')())

const customMergeConfig: TWMConfig = {
  twMerge: classList => classList,
  twMergeConfig: {
    extend: {
      classGroups: {
        'font-size': [{ text: ['32'] }],
      },
    },
  },
}
const customTVConfig: TVConfig = customMergeConfig
const customTv: TV = tv
expectType<string>(cn('text-32')(customMergeConfig))
expectType<string>(customTv({ base: 'text-32' }, customTVConfig)())
expectType<string>(createTV(customTVConfig)({ base: 'text-32' }, customTVConfig)())
expectType<string>(create(customTVConfig).cn('text-32')())
expectType<string>(create({ escape: false }, customTVConfig).tv({ base: 'text-32' })())
expectError(tv({ slots: { root: 'p-2' }, variants: { size: { sm: { missing: 'p-4' } } } }))
expectError(tv({ variants: { size: { sm: 'p-2' } }, defaultVariants: { missing: 'sm' } }))
