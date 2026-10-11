import type { WebHmrStep } from './cases'

export const issue1144InitialStyles = [
  { selector: '.issue-1144-important-probe', styles: { marginTop: '24px' } },
  { selector: '.issue-1144-pt-root', classFromText: true, styles: { paddingTop: '0px', paddingBottom: '0px' } },
]

export function issue1144Steps(): WebHmrStep[] {
  const steps: WebHmrStep[] = Array.from({ length: 12 }, (_, index) => {
    const previousPadding = [0, 10, 4][index % 3]!
    const padding = [10, 4, 0][index % 3]!
    const previousProbe = index === 0 ? '' : addedProbe(index - 1)
    const nextProbe = addedProbe(index)
    const width = 181 + index
    return {
      markerClass: `hbuilderx-web-hmr-probe bg-[#0f5132] text-[#f8fafc] w-[${width}px]`,
      markerText: `issue-1144-save-${index + 1}`,
      cssContains: [/background-color:\s*#0f5132/, /color:\s*#f8fafc/, new RegExp(`width:\\s*${width}px`)],
      runtimeStyles: [
        { selector: '.hbuilderx-web-hmr-probe', styles: { width: `${width}px`, backgroundColor: 'rgb(15, 81, 50)', color: 'rgb(248, 250, 252)' } },
        { selector: '.issue-1144-pt-root', classFromText: true, styles: { paddingTop: `${padding}px`, paddingBottom: `${padding}px` } },
        ...(index % 3 === 2
          ? []
          : [{
              selector: '.issue-1144-added-important',
              styles: { marginTop: index % 3 === 0 ? '24px' : '12px' },
            }]),
      ],
      sourceMutation: {
        file: 'pages/index/index.uvue',
        replace: {
          from: `<pt-probe :pt="{ root: 'p-${previousPadding}!' }" />${previousProbe}`,
          to: `<pt-probe :pt="{ root: 'p-${padding}!' }" />${nextProbe}`,
        },
      },
      reload: index === 11,
    }
  })
  const originalStyle = '<style scoped>\n.issue-1144-pt-root {\n  padding: 31px;\n}\n</style>'
  const variants = [
    '<style>\n.issue-1144-pt-root { border-top: 3px solid red; }\n</style>',
    '',
    '<style scoped>\n.issue-1144-pt-root { border-top: 5px solid red; }\n</style>',
    originalStyle,
  ]
  const suffix = '\n'
  for (const [index, style] of variants.entries()) {
    const previous = index === 0 ? originalStyle : variants[index - 1]!
    steps.push({
      markerClass: `hbuilderx-web-hmr-probe bg-[#7c2d12] text-[#ecfeff] w-[${193 + index}px]`,
      markerText: `issue-1144-component-style-${index}`,
      cssContains: [/background-color:\s*#7c2d12/, /color:\s*#ecfeff/, new RegExp(`width:\\s*${193 + index}px`)],
      sourceMutation: {
        file: 'components/pt-probe/pt-probe.uvue',
        replace: { from: `</script>\n\n${previous}${suffix}`, to: `</script>\n\n${style}${suffix}` },
      },
      runtimeStyles: [{
        selector: '.hbuilderx-web-hmr-probe',
        styles: { width: `${193 + index}px`, backgroundColor: 'rgb(124, 45, 18)', color: 'rgb(236, 254, 255)' },
      }, {
        selector: '.issue-1144-pt-root',
        classFromText: true,
        styles: { paddingTop: '0px', borderTopWidth: `${[3, 0, 5, 0][index]}px` },
      }],
      reload: index === variants.length - 1,
    })
  }
  return steps
}

function addedProbe(index: number) {
  return index % 3 === 2 ? '' : `<view class="issue-1144-added-important mt-${index % 3 === 0 ? 24 : 12}!">important</view>`
}
