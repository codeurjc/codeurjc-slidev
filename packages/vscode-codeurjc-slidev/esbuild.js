import { rmSync } from 'node:fs'
import process from 'node:process'
import * as esbuild from 'esbuild'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

// In watch mode, print (to stderr, which the task's terminal shows alongside
// stdout) when each rebuild starts and ends, and each error with
// its location, in the shape the `vscode-extension: watch` task's problem
// matcher (../../.vscode/tasks.json) reads -- so F5 waits for the first build
// and errors show up in the Problems panel.
const problemMatcherPlugin = {
  name: 'problem-matcher',
  setup(build) {
    build.onStart(() => console.error('[watch] build started'))
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`)
        if (location)
          console.error(`    ${location.file}:${location.line}:${location.column}:`)
      }
      console.error('[watch] build finished')
    })
  },
}

// A production build emits no source map, and `vsce` packages everything
// under dist/ -- so drop one left over from a dev build.
if (production)
  rmSync('dist/extension.cjs.map', { force: true })

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  outfile: 'dist/extension.cjs',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  plugins: watch ? [problemMatcherPlugin] : [],
})

if (watch) {
  await ctx.watch()
}
else {
  await ctx.rebuild()
  await ctx.dispose()
}
