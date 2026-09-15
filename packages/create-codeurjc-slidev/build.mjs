// Bundles the ODP importer (TypeScript, plus the theme composables it reuses,
// which ship as unbuilt TypeScript) into a single ESM file that the published
// `index.mjs` can import with plain Node -- no TypeScript loader at runtime.
import * as esbuild from 'esbuild'

// A rejected build is an unhandled rejection, which exits non-zero.
esbuild.build({
  entryPoints: ['src/odp/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/odp-import.mjs',
  // Runtime dependencies stay real imports (installed with the CLI);
  // everything else (including codeurjc-slidev-theme's composables) is inlined.
  external: ['fflate', '@xmldom/xmldom'],
  sourcemap: false,
})
