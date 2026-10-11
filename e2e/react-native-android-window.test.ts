import { describe, expect, it } from 'vitest'
import { findAndroidAnrWaitTap } from './react-native/android-window'

describe('React Native Android window guard', () => {
  it('locates the ANR wait action independently of text and attribute order', () => {
    const windowXml = `
      <hierarchy>
        <node bounds="[20,40][220,140]" resource-id="android:id/aerr_close" text="Cerrar la app" />
        <node text="Esperar" bounds="[20,140][220,260]" resource-id="android:id/aerr_wait" />
      </hierarchy>
    `
    expect(findAndroidAnrWaitTap(windowXml)).toEqual({ x: 120, y: 200 })
  })

  it('does not treat an unrelated wait button as an ANR dialog', () => {
    expect(findAndroidAnrWaitTap('<node bounds="[0,0][100,100]" resource-id="android:id/aerr_wait" />')).toBeUndefined()
  })

  it('rejects malformed or empty ANR action bounds', () => {
    const windowXml = `
      <node resource-id="android:id/aerr_close" bounds="[0,0][100,100]" />
      <node resource-id="android:id/aerr_wait" bounds="[40,40][40,80]" />
    `
    expect(findAndroidAnrWaitTap(windowXml)).toBeUndefined()
  })
})
