import type {
  FallbackCoordinatesResolver,
  ToggleThemeCapabilities,
  ToggleThemeEnvironment,
  ThemeTransitionPreset,
  UseToggleThemeOptions,
} from '..'
import { expectAssignable, expectError, expectType } from 'tsd'
import { useToggleTheme } from '..'

const resolver: FallbackCoordinatesResolver = () => ({ x: 0, y: 0 })
const preset: ThemeTransitionPreset = 'fade'

const options: UseToggleThemeOptions = {
  duration: 200,
  easing: 'ease-out',
  toggle: () => {},
  isCurrentDark: () => true,
  preset,
  fallbackCoordinates: resolver,
  viewTransition: {
    before: async () => {},
    after: () => {},
  },
}

const result = useToggleTheme(options)
expectType<Promise<void>>(result.toggleTheme())
expectType<boolean>(result.isAppearanceTransition)
expectAssignable<ToggleThemeCapabilities>(result.capabilities)
expectAssignable<ToggleThemeEnvironment>(result.environment)
expectError(useToggleTheme({ preset: 'zoom' }))
