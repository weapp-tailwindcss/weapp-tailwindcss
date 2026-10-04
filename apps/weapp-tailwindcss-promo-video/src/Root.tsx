import { Composition, Still } from 'remotion'
import { compositionId, films, FORMATS, FPS, LOCALES } from './config'
import { PromoCover, PromoVideo } from './Video'
import './styles.css'

export function RemotionRoot() {
  return (
    <>
      {LOCALES.flatMap(locale => FORMATS.map((format) => {
        const film = films[format]
        const id = compositionId(format, locale)
        return (
          <div key={id}>
            <Composition id={id} component={PromoVideo} fps={FPS} durationInFrames={film.seconds * FPS} width={film.width} height={film.height} defaultProps={{ format, locale }} />
            <Still id={`${id}Cover`} component={PromoCover} width={film.width} height={film.height} defaultProps={{ format, locale }} />
          </div>
        )
      }))}
    </>
  )
}
