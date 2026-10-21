import type { SourceFramework } from './fixtures'
import { fixtureIcon, fixtureIconLink } from '../browser/resources'
import { frameworkSource, frameworkSourceCss } from './fixtures'

/** 同一文件清单供隔离服务与fixtureHash消费，扫描仍只指向Probe源码。 */
export function frameworkSourceResources(framework: SourceFramework, runId: string, instance = '__FRAMEWORK_INSTANCE__') {
  const sourceName = `Probe.${framework === 'react' ? 'tsx' : 'vue'}`
  const entry = framework === 'react' ? `import './entry.css'\nimport './Probe.tsx'` : `import './entry.css'\nimport { createApp } from 'vue'\nimport App from './Probe.vue'\ncreateApp(App).mount('#app')`
  return { 'package.json': '{"type":"module"}', 'entry.css': frameworkSourceCss(framework), [sourceName]: frameworkSource(framework, 'initial', runId), 'entry.js': entry, 'favicon.svg': fixtureIcon, 'index.html': `<!doctype html><html><head><meta name="framework-instance" content="${instance}">${fixtureIconLink}</head><body><div id="app"></div><script type="module" src="/entry.js"></script></body></html>` }
}
