# codeurjc-slidev

Collection of themes, layouts, addons, and hacks for creating [Slidev](https://sli.dev) presentations in the CodeURJC group.

Includes a custom **drag-and-drop layout editor** that lets you visually arrange slide elements (title bar, logo, red bar, content area) and persist layouts to `.vue` files via a Vite dev server middleware.

## Features

- Custom Slidev layouts with draggable overlays (red bar, logo, title, content)
- Layout editor integrated into Slidev's built-in SideEditor panel
- Drag/resize slide elements with undo support
- Save layouts as new `.vue` files or overwrite the current one
- Urjc-themed UnoCSS preset (`urjc-red`, `urjc-green` colors)
- Unit tests (Vitest) and e2e tests (Playwright)

## Roadmap

- **Markdown-first authoring** — express both content and, as much as possible, styling choices (image placement, hidden titles, etc.) directly in slide frontmatter/markdown instead of hand-editing Vue.
- **Configurable layout, global + per-slide overrides** — e.g. image position (below vs. beside the text), collapsing the title so the image/code area expands to fill the freed space, and other layout knobs as they come up.
- **Auto-fit text size** — shrink text to fit the slide when it doesn't, but keep a comfortable default size when it does.
- **Easy code annotation** — mark up code (e.g. trailing-line comments that can target part of a line) and let tooling render the arrows/boxes/highlights automatically.
- **Code sync with real examples** — keep code shown in slides in sync with the actual example source (approach still to be explored).
- **Copy/paste image embedding** — paste or drag an image straight into a slide, with interactive cropping and resizing, without a manual asset pipeline.
- **Diagram support** — author diagrams with Mermaid or SVG, backed by an interactive editor.
- **Synthetic/boilerplate slides** — auto-generated slides that aren't hand-edited (cover, section index, license slide, etc.).

## Stack

- **Framework:** Vue 3 + TypeScript
- **Presentation:** Slidev 52
- **Styling:** UnoCSS
- **Unit tests:** Vitest 4 + jsdom + `@testing-library/vue`
- **E2e tests:** Playwright 1.61 (`@playwright/test`), Chromium
- **Package manager:** pnpm

## Getting started

```sh
pnpm install
pnpm dev          # start slidev dev server (port 3030)
pnpm build        # build static slides
pnpm export       # export to PDF
pnpm test         # run unit tests (vitest)
pnpm test:e2e     # run e2e tests (playwright, auto-starts server)
```

## Project structure

```
codeurjc-slidev/
├── slides.md                 # Presentation source
├── layouts/default.vue       # Slide layout with editor overlays
├── composables/useEditor.ts  # Layout editor state (drag, resize, undo)
├── _override/SideEditor.vue  # Custom layout tab in Slidev's SideEditor
├── global-top.vue             # Slidev global layer (paste-to-add-image listener)
├── vite.config.ts            # Vite transform + save-layout middleware
├── e2e/                      # E2e test environment
│   ├── slides.md             # Test presentation (standalone copy)
│   ├── vite.config.ts        # E2e-specific Vite config
│   └── layouts/default.vue   # Symlink to root layouts/default.vue
├── tests/                    # Playwright e2e tests
└── composables/__tests__/    # Vitest unit tests
```

## Development

1. Edit the layout (`layouts/default.vue`) or composable (`composables/useEditor.ts`)
2. Write/update tests (`composables/__tests__/` for unit, `tests/` for e2e)
3. Run `pnpm test && pnpm test:e2e`
4. Commit: `git add -A && git commit -m "message"`

The e2e test environment in `e2e/` uses symlinks to keep files in sync with the root project. The only unique file is `e2e/vite.config.ts` which provides the same transform and save-layout middleware scoped to the e2e directory. All test modifications are restored by `afterAll` hooks.
