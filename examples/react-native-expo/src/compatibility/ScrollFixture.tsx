import type { RefObject } from 'react'
import type { ScrollView as ScrollViewType, StyleProp, ViewStyle } from 'react-native'
import type { MeasurableNode } from './native-measure'
import type { NativeScrollSide } from './scroll-fixture'
import type { createScrollReadiness } from './scroll-readiness'
import { useLayoutEffect, useRef } from 'react'
import { ScrollView, View } from 'react-native'
import { measure } from './native-measure'
import { nativeScrollFixture } from './scroll-fixture'

let mountSequence = 0

export function ScrollFixture({ side, session, style, target }: {
  side: NativeScrollSide
  session: ReturnType<typeof createScrollReadiness>
  style: StyleProp<ViewStyle>
  target: RefObject<MeasurableNode | null>
}) {
  const scroll = useRef<ScrollViewType>(null)
  const first = useRef<View>(null)
  const mount = useRef<string>(undefined)
  mount.current ??= `scroll-${++mountSequence}`
  useLayoutEffect(() => {
    try {
      const instance = scroll.current
      const viewport = instance?.getNativeScrollRef() as MeasurableNode | undefined
      const stripe = first.current
      if (!instance || !viewport || !stripe) {
        throw new Error('ScrollView 缺少真实组件、viewport 或内容 ref')
      }
      target.current = viewport
      const assertAttached = () => {
        if (scroll.current !== instance || instance.getNativeScrollRef() !== viewport || first.current !== stripe) {
          throw new Error('ScrollView 三阶段内真实组件或 viewport 被替换')
        }
      }
      const detach = session.attach(side, { mountId: mount.current!, scrollTo: (command) => {
        assertAttached()
        instance.scrollTo(command)
      }, firstStripe: () => {
        assertAttached()
        return measure(stripe)
      } })
      return () => {
        if (target.current === viewport) {
          target.current = null
        }
        detach()
      }
    }
    catch (error) {
      session.fail(error)
    }
  }, [session, side, target])
  return (
    <ScrollView
      ref={scroll}
      style={[{ flexGrow: 0, flexShrink: 0 }, style]}
      {...session.callbacks[side]}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      bounces={false}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      removeClippedSubviews={false}
    >
      {nativeScrollFixture.colors.map((color, index) => <View key={color} ref={index === 0 ? first : undefined} collapsable={false} style={{ width: '100%', height: nativeScrollFixture.stripeHeight, flexShrink: 0, backgroundColor: color }} />)}
    </ScrollView>
  )
}
