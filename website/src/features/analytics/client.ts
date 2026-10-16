import type { ClientModule } from '@docusaurus/types'
import siteConfig from '@generated/docusaurus.config'
import { initializeAnalytics } from './runtime'

const analytics = typeof window === 'undefined' ? undefined : initializeAnalytics(window, siteConfig.url)

export const onRouteDidUpdate: NonNullable<ClientModule['onRouteDidUpdate']> = ({ location, previousLocation }) => {
  analytics?.onRouteDidUpdate(location, previousLocation)
}
