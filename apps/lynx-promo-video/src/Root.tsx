import { Composition, Still } from 'remotion'
import { defaultPromoProps, promoPropsForLocale, VIDEO } from './config'
import { LynxPromo } from './video/LynxPromo'
import { LynxPromoCover } from './video/LynxPromoCover'

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="LynxPromo"
        component={LynxPromo}
        durationInFrames={VIDEO.durationInFrames}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={defaultPromoProps}
      />
      <Composition
        id="LynxPromoZh"
        component={LynxPromo}
        durationInFrames={VIDEO.durationInFrames}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={promoPropsForLocale('zh')}
      />
      <Composition
        id="LynxPromoEn"
        component={LynxPromo}
        durationInFrames={VIDEO.durationInFrames}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={promoPropsForLocale('en')}
      />
      <Still
        id="LynxPromoCover"
        component={LynxPromoCover}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={defaultPromoProps}
      />
      <Still
        id="LynxPromoCoverZh"
        component={LynxPromoCover}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={promoPropsForLocale('zh')}
      />
      <Still
        id="LynxPromoCoverEn"
        component={LynxPromoCover}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={promoPropsForLocale('en')}
      />
    </>
  )
}
