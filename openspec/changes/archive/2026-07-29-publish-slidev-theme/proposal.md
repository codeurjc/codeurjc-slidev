## Why

Today, using any of this repo's features (draggable layout editor, code-highlight callouts, snippet import, slide title carry-over) in a new presentation requires cloning this entire repo — including its own example slides, exercise code, and test suites — and hand-editing in place. There is no way to start a new presentation repo that has only its own slides, its own referenced code, and a `package.json`. This change makes the reusable system installable as a Slidev theme, and adds a one-command scaffold for new presentation repos.

## What Changes

- Restructure the reusable parts of this repo (layouts, composables, `setup/`, `_override/SideEditor.vue`, `vite.config.ts` middlewares, `uno.config.ts` shortcuts) into a publishable Slidev **theme** package, `codeurjc-slidev-theme`, published to npm under the `ivchicano` account.
  - Keep the layout named `default` (not renamed) so consumer slides keep relying on Slidev's implicit "no `layout:` → use `default`" behavior exactly as this repo's own `slides.md` does today — no addon-style rename.
  - **BREAKING** (for how this repo's own middleware resolves paths): `vite.config.ts`'s `/api/save-layout` and `/api/save-code-highlight-position` middlewares currently resolve `layouts/` and `slides.md` via `import.meta.dirname` (the plugin file's own location). These are consumer-owned targets and must resolve against the consuming project's root (`server.config.root` / Slidev's `userRoot`) instead, so they still work once the plugin file lives inside an installed package rather than next to `slides.md`.
  - Consumer repos need **no `vite.config.ts` of their own** — Slidev's `resolveViteConfigs()` already globs `vite.config.*` across all roots (theme root + user root) and auto-merges them, confirmed by reading `@slidev/cli`'s resolver source.
  - This repo's own `slides.md`, `code/`, and test suites (`composables/__tests__/`, `tests/`, `e2e/`) remain as the theme's development/demo/test fixtures — they are not part of what a new repo needs, and are not templated or scanned for "referenced code" by any tooling.
- Add a `create-codeurjc-slidev` npm package (published alongside the theme) that scaffolds a new presentation repo in one command (`pnpm create codeurjc-slidev <name>`), mirroring `create-slidev`'s own bundled-template-copy approach. The generated repo contains exactly `package.json` (depending on `@slidev/cli` and `codeurjc-slidev-theme`), a starter `slides.md` (with `theme: codeurjc-slidev-theme` in frontmatter), and an empty `code/` directory.

## Capabilities

### New Capabilities
- `slidev-theme-packaging`: the reusable layout/editor/code-highlight/snippet-import/title-carryover system, packaged and published as an installable Slidev theme consumable by any Slidev project via `theme:` frontmatter + a `package.json` dependency, with correct package-root-vs-consumer-root path resolution in its Vite plugin.
- `project-scaffolding`: a `create-codeurjc-slidev` init command that generates a new presentation repo (`package.json`, `slides.md`, `code/`) pre-wired to the theme, without the user hand-writing any of those files.

### Modified Capabilities
<!-- Existing feature specs (code-highlight-callouts, code-snippet-import, etc.) keep their current requirements unchanged from a presenter's point of view; only where the content lives changes. -->

## Impact

- Affected code: `vite.config.ts` (path-resolution split into package-relative vs. consumer-relative), `package.json` (repo becomes the theme package's own source, or gains a `packages/` split), `_override/SideEditor.vue`, `composables/useEditor.ts` (path injected by the transform), `layouts/default.vue` (becomes the theme's default layout), `README.md`/`CLAUDE.md` (document the theme + scaffold workflow).
- New artifacts: `codeurjc-slidev-theme` npm package, `create-codeurjc-slidev` npm package.
- Test impact: `e2e/` currently symlinks composables/layouts/setup per instance to keep a second Slidev instance in sync with root files; once the plugin is properly parameterized by consumer root instead of physical file location, this symlink-maintenance burden (called out in `CLAUDE.md` as an easy-to-forget footgun) is expected to become unnecessary and should be revisited.
- No change to any existing feature's runtime behavior (markers, snippet-import grammar, layout-editor UX) as experienced from within a slide author's `slides.md`.
