## Context

This repo currently mixes two things in one directory tree: a reusable presentation "system" (draggable layout editor, code-highlight callouts, snippet import, slide title carry-over — implemented as `layouts/`, `composables/`, `setup/`, `_override/SideEditor.vue`, `vite.config.ts`, `uno.config.ts`) and one specific talk's content (`slides.md`, `code/`, plus this repo's own tests). Every new presentation today is built by cloning the whole repo and editing in place.

Investigation of `@slidev/cli`'s resolver (`node_modules/@slidev/cli/dist/resolver-CZx9LFrt.mjs`, `serve-bnzg299W.mjs`) showed Slidev already has first-class support for exactly this split:

- `getRoots()` resolves a `roots` array of `[...theme/addon package roots, userRoot]`.
- `resolveViteConfigs()` calls `resolveSourceFiles(options.roots, "vite.config")`, loading and `mergeConfig`-ing a `vite.config.*` found in **any** root, including a theme package's own root — the consumer needs no `vite.config.ts` of their own.
- `layouts/`, `setup/`, `components/` are resolved the same way: globbed across all roots, with later roots (closer to `userRoot`) taking precedence — so a consumer overriding a theme-provided layout by name "just works" without custom fallback code.
- `resolveViteConfigs()` always sets `root: options.userRoot` on the merged Vite config, so `configureServer(server)` hooks see `server.config.root === userRoot` regardless of where the plugin's own source file lives on disk.

This means the packaging problem is smaller than it first looks: the main real defect to fix is that `vite.config.ts`'s server middlewares currently derive consumer-owned paths (`layouts/` write target, `slides.md` write target) from `import.meta.dirname` (the plugin file's own location) instead of the resolved project root. That assumption is silently correct only because, today, the plugin file and `slides.md` happen to live in the same directory.

Slidev also distinguishes **themes** (may override built-in layout names like `default`) from **addons** (must not override built-ins, only add new ones). This repo's layout is literally named `default` and every ordinary slide in the existing `slides.md` relies on Slidev's implicit "no `layout:` → use `default`" fallback. Packaging as an addon would require renaming the layout and adding `layout: <name>` to every slide — a real regression from today's authoring experience. Packaging as a theme preserves it exactly.

## Goals / Non-Goals

**Goals:**
- A new presentation repo needs only `package.json`, `slides.md`, and `code/` to get the full authoring experience this repo has today (implicit default layout, drag/resize editor, code-highlight markers, snippet import, title carry-over).
- No behavior change for slide authors: marker grammar, snippet-import grammar, and layout-editor UX stay identical.
- A one-command scaffold (`pnpm create codeurjc-slidev <name>`) generates that new repo without the user hand-writing `package.json`.
- This repo's own `slides.md`/`code/`/tests continue to serve as the theme's development, demo, and regression-test fixtures.

**Non-Goals:**
- No tooling to copy/sync "only the code referenced by a given slides.md" into a new repo — confirmed out of scope; new repos start with their own empty `code/`.
- No addon packaging path — theme only, per the layout-naming decision above.
- No change to the marker/snippet-import/title-carryover grammars themselves.
- Not scoping a private-registry or paid-publishing setup — publishing target is public npm under the `ivchicano` account.

## Decisions

### Theme, not addon
Keep the layout named `default`. Publish as a Slidev **theme** (`theme: codeurjc-slidev-theme` in consumer frontmatter), not an addon. Rejected alternative (addon + renamed layout) would force `layout: <name>` onto every slide in every consumer repo, breaking the "develop like they would by cloning this repo" goal that motivated this change.

### Fix path resolution by consumer-root vs. package-root, not by physical relocation
Split `vite.config.ts`'s path handling into two categories instead of leaving everything `import.meta.dirname`-relative:
- **Package-owned** (stay `import.meta.dirname`-relative, since they're the theme's own authored files): `_override/SideEditor.vue` (read for the transform), `composables/useEditor.ts` (path injected into the transformed override), the theme's own shipped `layouts/default.vue` (fallback template when a consumer has no local override).
- **Consumer-owned** (must resolve against the resolved Vite project root, not the plugin file's location): the `layouts/` directory the save-layout middleware reads from/writes `.vue` files into, and `slides.md` (read/write target of the save-code-highlight-position middleware).

Use `server.config.root` inside `configureServer(server)` for the consumer-owned paths. This was confirmed to always equal Slidev's `userRoot` regardless of where the theme package physically resides (see Context). No new Slidev API or convention is needed — this is a straightforward bug fix that happens to be prerequisite for packaging.

Rejected alternative: keep `import.meta.dirname` everywhere and require consumers to symlink/copy `vite.config.ts` per project (mirrors this repo's existing `e2e/` symlink pattern) — rejected because it reproduces the exact staleness/footgun problem already called out in this repo's own `CLAUDE.md`, and doesn't satisfy "no clone" for end users.

### Rely on Slidev's own roots-merging instead of custom override logic
Do not write custom "does a consumer override exist, else fall back to theme's copy" logic for layouts — Slidev's own `roots`-glob (client → theme → addons → user, later wins) already does this for anything named identically. Only the *write side* (save-layout middleware picking which file to write: consumer's own copy if present, else save-as a new consumer-local file) needs explicit handling, since writes aren't a resolve-time glob.

### Package layout
Two published npm packages:
- `codeurjc-slidev-theme` — the runtime theme (layouts, composables, setup, `_override`, `vite.config.ts`, `uno.config.ts` shortcuts).
- `create-codeurjc-slidev` — scaffolding CLI, mirroring `create-slidev`'s own implementation shape (bundled `template/` directory, `minimist` + `prompts` for the project name, copies template, patches `package.json`'s `name`). Kept separate from the theme package so consumer repos never carry scaffolding-only dependencies (`prompts`, `minimist`, etc.) at runtime.

This repo itself becomes the theme's development repo: its `slides.md`, `code/`, `composables/__tests__/`, `tests/`, `e2e/` remain in place as the fixtures used to build and regression-test the theme, not something consumers receive.

## Risks / Trade-offs

- [Risk] `server.config.root` may not be set yet at the point some middlewares currently run, or may differ subtly from `userRoot` in edge cases (e.g. `slidev build` vs `slidev` dev server invocation paths). → Mitigation: verify against both `resolveViteConfigs` call sites (`createServer$1` and `build`) before relying on it in both middlewares; fall back to explicitly importing/using `options.userRoot` via the addon/theme's own `setup` hooks if `server.config.root` proves unreliable in either mode.
- [Risk] Splitting the repo's identity (dev repo vs. published package) risks packaging staleness (e.g. `pnpm build`/publish forgetting a file, or `files`/`exports` misconfigured in the theme's `package.json`) since there is no build step today (files are shipped as-is per Slidev's addon/theme convention). → Mitigation: an explicit publish checklist/task and a smoke-test step (scaffold a repo with `create-codeurjc-slidev`, run `pnpm dev`, confirm parity) before any npm publish.
- [Risk] The `e2e/` symlink-based test harness may or may not actually become unnecessary once path resolution is root-aware — this is a prediction, not yet verified. → Mitigation: treat "simplify/remove e2e symlinks" as a stretch task, not a blocking one; keep the existing symlink setup working throughout this change and only remove it once proven redundant.
- [Trade-off] Public npm publishing means anyone can install `codeurjc-slidev-theme`/`create-codeurjc-slidev`; there's no plan here for semver/versioning discipline beyond "publish what works." Acceptable for the current scope (small internal user base) but should be revisited if external adoption grows.

## Migration Plan

1. Fix `vite.config.ts` path resolution (package- vs. consumer-owned) in place, in this repo, with existing tests (`pnpm test`, `pnpm test:e2e`) as the safety net — no package split yet.
2. Extract theme-owned files into a `packages/codeurjc-slidev-theme/` (or similar) subdirectory within this repo, wire it up via pnpm workspace, and re-point this repo's own root `slides.md`/`vite.config.ts` usage to consume it exactly as an external consumer would (`theme:` frontmatter + workspace dependency) — this doubles as the first real "dogfood" test of the packaging boundary.
3. Publish `codeurjc-slidev-theme` to npm.
4. Build and publish `create-codeurjc-slidev`, scaffold a throwaway repo with it, and manually verify full authoring parity (drag/resize editor, markers, snippet import, title carry-over) against this repo's own dev experience.
5. Update `README.md`/`CLAUDE.md` to document the new theme + scaffold workflow as the primary way to start a new presentation.

No rollback complexity beyond npm `unpublish`/deprecate within npm's window, since no consumer repos exist yet at the time of this change.

## Open Questions

- Should `codeurjc-slidev-theme`'s own `package.json` also declare `@slidev/theme-default` as a dependency (layering on top of it) or is it fully self-contained? Needs checking against how `layouts/default.vue` currently behaves relative to Slidev's built-in default.
- Exact workspace layout for step 2 of the migration plan (subdirectory-in-this-repo vs. a second sibling repo for the theme) is left to implementation; either satisfies the design as long as this repo's own `slides.md` keeps dogfooding the published boundary.
