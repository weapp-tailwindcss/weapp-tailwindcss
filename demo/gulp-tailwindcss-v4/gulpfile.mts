import path from 'node:path'
import process from 'node:process'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import gulp from 'gulp'
import type { TaskFunction } from 'gulp'
import debug from 'gulp-debug'
import gulpif from 'gulp-if'
import plumber from 'gulp-plumber'
import postcss from 'gulp-postcss'
import rename from 'gulp-rename'
import replace from 'gulp-replace'
import gulpSass from 'gulp-sass'
import ts from 'gulp-typescript'
import gutil from 'gulp-util'
import dartSass from 'sass'
import { createPlugins } from 'weapp-tailwindcss/gulp'
import parity from '../official-postcss-parity-plugin.cjs'
import { watchRoots } from './watch-roots.mjs'

const isDebug = Boolean(process.env.DEBUG)
const isWatch = Boolean(process.env.WATCH)
// const isLocal = Boolean(process.env.LOCAL)
const useBabel = Boolean(process.env.BABEL)
const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const officialPostcssParity = process.env.WEAPP_TW_OFFICIAL_POSTCSS_PARITY === '1'

const platformMap = {
  weapp: {
    template: 'wxml',
    css: 'wxss',
  },
  tt: {
    template: 'ttml',
    css: 'ttss',
  },
}

const platform = (process.env.PLATFORM ?? 'weapp') as keyof typeof platformMap

const platformHit = platformMap[platform]
if (!platformHit) {
  throw new Error(`not support ${platform} platform`)
}

const sass = gulpSass(dartSass)
const tsProject = ts.createProject('tsconfig.json')
const generator = {
  styleOptions: {
    px2rpx: {
      designWidth: 375,
    },
  },
}

// Tailwind CSS 先由 generateWxss 生成，再交给 Gulp 原有 PostCSS 流程继续处理。
const { adaptWxss, generateWxss, transformJs, transformWxml } = createPlugins({
  tailwindcssBasedir: projectRoot,
  cssEntries: [
    path.resolve(projectRoot, 'src/app.css'),
    path.resolve(projectRoot, 'src/sub-normal/pages/index.css'),
    path.resolve(projectRoot, 'src/sub-independent/pages/index.css'),
  ],
  cssSourceTrace: true,
  rem2rpx: true,
  generator: officialPostcssParity ? false : generator,
  customAttributes: {
    '*': [/^t-class(?:-.+)?$/],
  },
  postcssOptions: parity.createOfficialPostcssParityPostcssOptions(),
  tailwindcss: {
    version: 4,
    packageName: 'tailwindcss',
  },
})
// {
//   mangle: true
// }

type StreamTask = NodeJS.ReadWriteStream & { destroyed?: boolean }
type Watcher = ReturnType<typeof gulp.watch>

let sourceWatcher: Watcher | undefined
let watchTaskQueue = Promise.resolve()

function promisify(task: StreamTask) {
  return new Promise<void>((resolve, reject) => {
    if (task.destroyed) {
      resolve()
      return
    }
    const cleanup = () => {
      task.removeListener('finish', onResolve)
      task.removeListener('end', onResolve)
      task.removeListener('error', onError)
    }
    const onResolve = () => {
      cleanup()
      resolve()
    }
    const onError = (error: unknown) => {
      cleanup()
      reject(error)
    }
    task.once('finish', onResolve)
    task.once('end', onResolve)
    task.once('error', onError)
  })
}

// 相关路径配置
const paths = {
  src: {
    baseDir: 'src',
    imgDir: 'src/image',
    spriteDir: 'src/assets/sprites',
    scssDir: 'src/assets/scss',
    imgFiles: 'src/image/**/*',
    styleFiles: 'src/**/*.{css,scss}',
    baseFiles: ['src/**/*.{png,jpg,json}'], // , '!src/assets/**/*', '!src/image/**/*'
    assetsDir: 'src/assets',
    assetsImgFiles: 'src/assets/images/**/*.{png,jpg,jpeg,svg,gif}',
    wxmlFiles: `src/**/*.${platformHit.template}`,
    jsFiles: 'src/**/*.{js,ts}',
  },
  dist: {
    baseDir: 'dist',
    imgDir: 'dist/image',
    wxssFiles: `dist/**/*.${platformHit.css}`,
  },
  tmp: {
    baseDir: 'tmp',
    imgDir: 'tmp/assets/images',
    imgFiles: 'tmp/assets/images/**/*.{png,jpg,jpeg,svg,gif}',
  },
}

// Log for output msg.
function log(...args: unknown[]) {
  gutil.log(...args)
}

async function deleteAsync(paths: string | string[]) {
  const targets = Array.isArray(paths) ? paths : [paths]
  await Promise.all(
    targets.map(async target => rm(target, { force: true, recursive: true })),
  )
}

// 样式编译
function styleCompile() {
  return gulp
    .src(paths.src.styleFiles)
    .pipe(gulpif(
      file => path.extname(file.path) === '.scss',
      sass({
        style: 'expanded',
        silenceDeprecations: ['legacy-js-api'],
      }).on('error', sass.logError),
    ))
    .pipe(gulpif(isDebug, debug({ title: '`styleCompile` Debug:' })))
    .pipe(generateWxss())
    .pipe(postcss())
    .pipe(adaptWxss())
    .pipe(
      rename({
        extname: `.${platformHit.css}`,
      }),
    )
    .pipe(replace('.scss', `.${platformHit.css}`))
    .pipe(replace('.css', `.${platformHit.css}`))
    .pipe(gulp.dest(paths.dist.baseDir))
}

// 复制基础文件
function copyBasicFiles() {
  return gulp.src(paths.src.baseFiles, {}).pipe(gulp.dest(paths.dist.baseDir))
}

function compileTsFiles() {
  return gulp.src(paths.src.jsFiles, {}).pipe(plumber()).pipe(tsProject()).pipe(transformJs()).pipe(gulp.dest(paths.dist.baseDir))
}

// 复制 WXML
function copyWXML() {
  return gulp.src(paths.src.wxmlFiles, {}).pipe(transformWxml()).pipe(gulp.dest(paths.dist.baseDir))
}

// clean 任务, dist 目录
function cleanDist() {
  return deleteAsync([paths.dist.baseDir])
}

// clean tmp 目录
function cleanTmp() {
  return deleteAsync([paths.tmp.baseDir])
}

const watchHandler = async function (type: 'changed' | 'removed' | 'add', file: string) {
  const extname = path.extname(file)
  // SCSS 文件
  if (extname === '.scss' || extname === '.css') {
    if (type === 'removed') {
      const tmp = file.replace('src/', 'dist/').replace(extname, `.${platformHit.css}`)
      await deleteAsync([tmp])
    }
    else {
      await promisify(styleCompile())
    }
  }
  // 图片文件
  else if (extname === '.png' || extname === '.jpg' || extname === '.jpeg' || extname === '.svg' || extname === '.gif') {
    if (type === 'removed') {
      if (file.includes('assets')) {
        await deleteAsync([file.replace('src/', 'tmp/')])
      }
      else {
        await deleteAsync([file.replace('src/', 'dist/')])
      }
    }
    else {
      // do sth
    }
  }

  // wxml
  else if (extname === `.${platformHit.template}`) {
    if (type === 'removed') {
      const tmp = file.replace('src/', 'dist/')
      await deleteAsync([tmp])
    }
    else {
      await promisify(copyWXML())
      await promisify(styleCompile())
    }
  }
  else if (extname === '.js' || extname === '.ts') {
    if (type === 'removed') {
      const tmp = file.replace('src/', 'dist/')
      await deleteAsync([tmp])
    }
    else {
      await promisify(compileTsFiles())
      await promisify(styleCompile())
    }
  }

  // 其余文件
  else {
    if (type === 'removed') {
      const tmp = file.replace('src/', 'dist/')
      await deleteAsync([tmp])
    }
    else {
      await promisify(copyBasicFiles())
    }
  }
}

function queueWatchHandler(type: 'changed' | 'removed' | 'add', file: string) {
  watchTaskQueue = watchTaskQueue
    .then(async () => {
      await watchHandler(type, file)
      log(`${gutil.colors.green(file)} ${type} handled`)
      log('build complete')
    })
    .catch((error: unknown) => {
      log(`${gutil.colors.red(file)} ${type} failed`, error)
    })
}

// 监听文件
async function watchFiles() {
  sourceWatcher = await watchRoots(gulp.watch.bind(gulp), [
    paths.src.baseDir,
    paths.tmp.imgDir,
  ], {
    ignored: /[/\\]\./,
    ignoreInitial: true,
    interval: Number(process.env.CHOKIDAR_INTERVAL ?? 1000),
    usePolling: process.env.CHOKIDAR_USEPOLLING === '1' || process.env.CHOKIDAR_USEPOLLING === 'true',
  })
  sourceWatcher
    .on('ready', () => {
      log('watching for changes')
    })
    .on('change', (file) => {
      log(`${gutil.colors.yellow(file)} is changed`)
      queueWatchHandler('changed', file)
    })
    .on('add', (file) => {
      log(`${gutil.colors.yellow(file)} is added`)
      queueWatchHandler('add', file)
    })
    .on('unlink', (file) => {
      log(`${gutil.colors.yellow(file)} is deleted`)
      queueWatchHandler('removed', file)
    })
}

const buildTasks: TaskFunction[] = [
  cleanTmp as TaskFunction,
  copyBasicFiles as TaskFunction,
  styleCompile as TaskFunction,
  copyWXML as TaskFunction,
  compileTsFiles as TaskFunction,
]

if (isWatch) {
  buildTasks.push(watchFiles as TaskFunction)
}
// 注册默认任务
gulp.task('default', gulp.series(...buildTasks))

// 删除任务
gulp.task('clean', gulp.parallel(cleanTmp, cleanDist))
