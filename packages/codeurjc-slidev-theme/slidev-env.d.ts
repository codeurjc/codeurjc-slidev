// Pulls in `@slidev/client`'s own `vue-router` `RouteMeta`/`vue` module
// augmentation (slide frontmatter, clicks context, etc.). Nothing in our own
// `include` glob imports these ambient-only files directly, so without this
// they're invisible to our program and every composable of theirs that reads
// `route.meta.slide.*` type-checks as `{}`/`unknown` instead of its real shape.
import '@slidev/client/shim-vue.d.ts'
import '@slidev/client/shim.d.ts'

// The above imports make this file a module, so `declare global` is required
// for these to actually land as globals rather than module-local bindings.
// `@slidev/client`'s own composables reference these as bare globals,
// expecting Slidev's Vite config to replace them at build time (via
// `define`). Declaring them here only satisfies static analysis for
// `vue-tsc --noEmit` -- it has no runtime effect, and doesn't change what
// Slidev itself injects when it builds.
declare global {
  const __DEV__: boolean
  const __SLIDEV_FEATURE_EDITOR__: boolean
  const __SLIDEV_HAS_SERVER__: boolean
  const __SLIDEV_HASH_ROUTE__: boolean
  const __SLIDEV_FEATURE_DRAWINGS_PERSIST__: boolean
}
