# Developing the theme itself

This repo is a pnpm workspace. The theme package lives in `packages/codeurjc-slidev-theme/`; the scaffolding CLI in `packages/create-codeurjc-slidev/`. The root `slides.md`/`code/` are dev/demo fixtures that consume the theme package exactly as an external project would (`theme: codeurjc-slidev-theme` + a `workspace:*` dependency), so they double as the theme's own dogfooding and regression-test target.

## Stack

- **Framework:** Vue 3 + TypeScript
- **Presentation:** Slidev 52
- **Styling:** UnoCSS
- **Unit tests:** Vitest 4 + jsdom + `@testing-library/vue`
- **E2e tests:** Playwright 1.61 (`@playwright/test`), Chromium
- **Lint/format:** ESLint (`@antfu/eslint-config`, flat config) — one tool for both, no separate Prettier
- **Pre-commit hooks:** `simple-git-hooks` + `lint-staged` (installed automatically by `pnpm install`'s `prepare` script; runs `eslint --fix` on staged files)
- **Package manager:** pnpm (workspace)

## Commands

```sh
pnpm install
pnpm dev          # start slidev dev server on this repo's own slides.md (port 3030)
pnpm build        # build static slides
pnpm export       # export to PDF
pnpm lint         # eslint . --cache
pnpm lint:fix     # eslint . --cache --fix
pnpm typecheck    # vue-tsc/tsc --noEmit across the theme + vscode extension packages
pnpm test         # run the theme package's + vscode extension's unit tests (vitest)
pnpm test:e2e     # run e2e tests (playwright, auto-starts dev server(s) against e2e/slides.md and per-worker fixtures)
pnpm test:extension  # vscode extension-host smoke tests (needs a display; xvfb-run on headless machines)
```

## CI

`.github/workflows/test.yml` runs on every push/PR to `main`: `lint`, `typecheck`, `unit-test`, `e2e`, and `build` as independent parallel jobs. `.github/workflows/extension-test.yml` runs the (slower, Electron-based) `test:extension` smoke suite via `xvfb-run`, but only on push to `main` and only when `packages/vscode-codeurjc-slidev/**` changed — it's not a PR-blocking check.

## Project structure

```
codeurjc-slidev/
├── slides.md                              # This repo's own dev/demo presentation
├── tutorial.md                            # User-facing tutorial presentation
├── code/                                  # Example code referenced by these presentations
├── packages/
│   ├── codeurjc-slidev-theme/             # Published theme package
│   │   ├── layouts/                       # default.vue, cover.vue, copyright.vue
│   │   ├── composables/                   # Editor state, marker parsing, snippet import, etc.
│   │   ├── setup/                         # Markdown transformers, title-carryover preparser
│   │   ├── _override/SideEditor.vue       # Custom "Layout" tab in Slidev's SideEditor
│   │   ├── vite.config.ts                 # Transform + save-layout/save-highlight-position middleware
│   │   └── uno.config.ts
│   └── create-codeurjc-slidev/            # Published scaffolding CLI
│       ├── index.mjs
│       └── template/                      # Files copied into a newly scaffolded project
├── e2e/                                   # E2e test fixture presentation (slides.md, code/, public/)
├── tests/                                 # Playwright e2e tests
└── openspec/                              # OpenSpec change proposals
```

## Development cycle

1. Edit the theme (`packages/codeurjc-slidev-theme/layouts/`, `composables/`, `setup/`, etc.)
2. Write/update tests (`packages/codeurjc-slidev-theme/composables/__tests__/` for unit, `tests/` for e2e)
3. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
4. Commit: `git add -A && git commit -m "message"` — a pre-commit hook runs `eslint --fix` on staged files automatically
5. CI re-runs lint/typecheck/test/e2e/build on the pushed branch/PR (see "CI" above)

Publishing a new version of either package: bump its `version` in `packages/<name>/package.json`, then `cd packages/<name> && npm publish --access public` (requires npm 2FA).
