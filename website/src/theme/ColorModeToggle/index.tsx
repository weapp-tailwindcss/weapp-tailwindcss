import type { Props } from '@theme/ColorModeToggle'
import type { MouseEvent } from 'react'
import OriginalToggle from '@theme-original/ColorModeToggle'
import { useRef } from 'react'
import { useToggleTheme } from 'theme-transition'

const appearanceTransitionMedia = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

function changeColorMode(props: Props) {
  props.onChange(props.value === 'dark' ? 'light' : 'dark')
}

function shouldUseAppearanceTransition() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }

  if (document.visibilityState !== 'visible') {
    return false
  }

  if (!window.matchMedia?.(appearanceTransitionMedia).matches) {
    return false
  }

  const navigatorLike = window.navigator as Navigator & {
    connection?: {
      saveData?: boolean
    }
    deviceMemory?: number
    hardwareConcurrency?: number
  }

  if (navigatorLike.connection?.saveData) {
    return false
  }

  const memory = navigatorLike.deviceMemory
  const cores = navigatorLike.hardwareConcurrency
  if (typeof memory === 'number' && typeof cores === 'number' && memory <= 4 && cores <= 4) {
    return false
  }

  return true
}

function Toggler(props: Props) {
  const isTransitioning = useRef(false)
  const { toggleTheme } = useToggleTheme({
    preset: 'fade',
    isCurrentDark() {
      return props.value === 'dark'
    },
    toggle() {
      changeColorMode(props)
    },
  })

  async function runAppearanceTransition(event: MouseEvent<HTMLDivElement>) {
    if (isTransitioning.current) {
      return
    }

    isTransitioning.current = true
    try {
      await toggleTheme({
        clientX: event.clientX,
        clientY: event.clientY,
      })
    }
    finally {
      isTransitioning.current = false
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!shouldUseAppearanceTransition()) {
      changeColorMode(props)
      return
    }

    void runAppearanceTransition(event)
  }

  return (
    <div
      onClick={handleClick}
    >
      <OriginalToggle
        {...props}
        onChange={() => {}}
      >
      </OriginalToggle>
    </div>

  )
}

export default Toggler
