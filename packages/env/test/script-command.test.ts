import { describe, expect, it } from 'vitest'
import { detectFrameworkCommands } from '../src/script-command'

describe('framework script command detection', () => {
  it.each([
    ['taro build --type weapp', 'taro'],
    ['mpx build', 'mpx'],
    ['mpx-cli-service serve', 'mpx'],
    ['weapp-vite dev --mode xx', 'weapp-vite'],
    ['uni build -p mp-weixin', 'uni-app-vite'],
    ['uni --ssr', 'uni-app-vite'],
    ['cross-env WEAPP_TW_HMR_TIMING=1 BROWSERSLIST_ENV=development taro build --type h5 --watch', 'taro'],
    ['cross-env WEAPP_TW_HMR_TIMING=1 WEAPP_TW_LOADER_DEBUG=1 mpx-cli-service serve', 'mpx'],
    ['cross-env WEAPP_TW_HMR_TIMING=1 UNI_INPUT_DIR=. uni -p app', 'uni-app-vite'],
    ['cross-env WEAPP_TW_HMR_TIMING=1 weapp-vite dev -m x', 'weapp-vite'],
    ['NODE_ENV=production taro build --type weapp', 'taro'],
    ['NODE_OPTIONS="--max-old-space-size=4096" pnpm exec weapp-vite build', 'weapp-vite'],
    ['pnpm exec taro build', 'taro'],
    ['pnpm taro build', 'taro'],
    ['pnpm -C ./app --filter frontend exec taro build', 'taro'],
    ['pnpm --filter=frontend --silent exec -- taro build', 'taro'],
    ['pnpm dlx weapp-vite@7.4.0 build', 'weapp-vite'],
    ['pnpm dlx --package @tarojs/cli taro build', 'taro'],
    ['npx -y taro build', 'taro'],
    ['npx -- taro@4.3.0 build', 'taro'],
    ['npx --package=@mpxjs/cli mpx build', 'mpx'],
    ['npx --no-install --package @dcloudio/uni-app uni build', 'uni-app-vite'],
    ['env -i -u NODE_OPTIONS --chdir ./app NODE_ENV=production taro build', 'taro'],
    ['env --unset=NODE_OPTIONS cross-env NODE_ENV=production pnpm exec taro build', 'taro'],
    ['cross-env-shell NODE_ENV=production "taro build --type weapp"', 'taro'],
    ['./node_modules/.bin/taro build', 'taro'],
    ['"./node_modules/.bin/weapp-vite" build', 'weapp-vite'],
    [String.raw`"C:\Program Files\nodejs\pnpm.cmd" exec "C:\project\node_modules\.bin\taro.cmd" build`, 'taro'],
    [String.raw`set NODE_ENV=production&& .\node_modules\.bin\TARO.CMD build`, 'taro'],
    ['set "NODE_ENV=production" && "mpx-cli-service.cmd" build', 'mpx'],
    ['taro \\\n      build --type weapp', 'taro'],
  ])('detects executable positions: %s', (script, appType) => {
    expect(detectFrameworkCommands(script)).toEqual([appType])
  })

  it.each([
    '',
    'eslint weapp-vite.config.ts',
    'eslint taro.config.ts mpx.config.js uni',
    'node ./scripts/run-mpx-cli-service.js serve',
    'node ../../scripts/taro-build-guard.mjs',
    'node ../../scripts/weapp-vite-e2e-watch.mjs',
    'echo taro build',
    'echo "weapp-vite && taro || mpx; uni"',
    'printf "%s" "mpx-cli-service"',
    'node -e "console.log(\'uni build; taro\')"',
    'node -e \'console.log("weapp-vite && mpx")\'',
    'cp taro ./output',
    'pnpm run taro build',
    'pnpm build --config weapp-vite.config.ts',
    'pnpm --filter taro run build',
    'pnpm --unknown-option taro build',
    'npx --package taro node check.js',
    'npx --unknown-option taro build',
    'npx --package',
    'npx @unrelated/taro build',
    'pnpm dlx @unrelated/weapp-vite@latest build',
    'echo hello ^\r\nmpx',
    'echo hello \\\r\nweapp-vite',
    'echo hello >& taro',
    'echo hello >&weapp-vite',
    'echo hello <& mpx',
    'env --unknown-option taro build',
    'cross-env TARO_ENV=weapp echo taro',
    'cross-env VALUE="taro && mpx" node check.js',
    'cross-env-shell "echo taro"',
    'cross-env-shell echo "taro && mpx"',
    '"taro build"',
    'taro.config.ts build',
    'weapp-vite-helper build',
    'mpx-cli-service.js build',
    'uni-app build',
    'echo $(printf "taro && mpx")',
    // eslint-disable-next-line no-template-curly-in-string -- 验证字面量 shell 参数展开。
    'echo ${FALLBACK:-hello && mpx build}',
    'echo `printf "taro && mpx"`',
    'echo taro\\;mpx',
    'echo taro^&mpx',
    '# taro build',
    'echo hi # taro build',
    'taro build "unterminated',
    'taro build $(unterminated',
    'cat <<EOF\nmpx build\nEOF',
  ])('ignores arguments, output and unsupported shell forms: %s', (script) => {
    expect(detectFrameworkCommands(script)).toEqual([])
  })

  it('collects chained commands in occurrence order and deduplicates frameworks', () => {
    expect(detectFrameworkCommands('echo "taro" && uni build || mpx build; taro build | weapp-vite build & taro build')).toEqual([
      'uni-app-vite',
      'mpx',
      'taro',
      'weapp-vite',
    ])
  })

  it('supports an explicitly quoted cross-env-shell command chain', () => {
    expect(detectFrameworkCommands('cross-env-shell NODE_ENV=production "taro build && mpx-cli-service build"')).toEqual(['taro', 'mpx'])
  })

  it('保留重定向后的真实命令链', () => {
    expect(detectFrameworkCommands('echo hello 2>&1 && mpx build &>output.log; taro build')).toEqual(['mpx', 'taro'])
  })

  it('resumes detection after comments and opaque shell expansions', () => {
    expect(detectFrameworkCommands('echo $(printf "weapp-vite; mpx") && taro build # uni build\nmpx build')).toEqual(['taro', 'mpx'])
  })

  it('does not match inherited object properties as command names', () => {
    expect(detectFrameworkCommands('constructor && __proto__ && toString')).toEqual([])
  })
})
