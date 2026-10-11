import type { TaskFunction } from 'gulp'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import gulp from 'gulp'
import postcss from 'gulp-postcss'
import rename from 'gulp-rename'
import ts from 'gulp-typescript'
import { createPlugins } from 'weapp-tailwindcss/gulp'

const platformMap = {
  weapp: { template: 'wxml', css: 'wxss' },
  tt: { template: 'ttml', css: 'ttss' },
}
const platform = (process.env.PLATFORM ?? 'weapp') as keyof typeof platformMap
const platformHit = platformMap[platform]

const tsProject = ts.createProject('tsconfig.json')
const generator = {
  styleOptions: {
    px2rpx: {
      designWidth: 375,
    },
  },
}
const { transformJs, transformWxml, transformWxss } = createPlugins({
  tailwindcssBasedir: process.cwd(),
  cssSourceTrace: true,
  rem2rpx: true,
  generator,
  tailwindcss: {
    version: 4,
    packageName: 'tailwindcss',
  },
  cssEntries: [path.resolve(process.cwd(), 'src/app.css')],
})

const paths = {
  baseFiles: ['src/**/*.{json,png,jpg,jpeg,svg,gif}'],
  styleFiles: 'src/**/*.css',
  templateFiles: `src/**/*.${platformHit.template}`,
  scriptFiles: 'src/**/*.{js,ts}',
}

async function clean() {
  await rm('dist', { recursive: true, force: true })
}

function copyBasicFiles() {
  return gulp.src(paths.baseFiles).pipe(gulp.dest('dist'))
}

function compileStyles() {
  return gulp.src(paths.styleFiles)
    .pipe(postcss())
    .pipe(transformWxss())
    .pipe(rename({ extname: `.${platformHit.css}` }))
    .pipe(gulp.dest('dist'))
}

function copyTemplates() {
  return gulp.src(paths.templateFiles).pipe(transformWxml()).pipe(gulp.dest('dist'))
}

function compileScripts() {
  return gulp.src(paths.scriptFiles).pipe(tsProject()).pipe(transformJs()).pipe(gulp.dest('dist'))
}

const buildTasks: TaskFunction[] = [
  clean as TaskFunction,
  copyBasicFiles as TaskFunction,
  compileStyles as TaskFunction,
  copyTemplates as TaskFunction,
  compileScripts as TaskFunction,
]

gulp.task('default', gulp.series(...buildTasks))
