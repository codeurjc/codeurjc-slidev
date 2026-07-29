# codeurjc-slidev

A [Slidev](https://sli.dev) theme for CodeURJC presentations, plus this repo, which is the theme's own development, demo, and test environment.

Includes a custom **drag-and-drop layout editor** that lets you visually arrange slide elements (title bar, logo, red bar, content area) and persist layouts to `.vue` files via a Vite dev server middleware, code-highlight callouts, code-snippet import from a `code/` directory, and slide title/subtitle carry-over.

## Starting a new presentation

You don't need to clone this repo to build a CodeURJC-themed presentation. Scaffold a new one with:

```sh
pnpm create codeurjc-slidev my-talk
cd my-talk
pnpm install
pnpm dev
```

This generates a standalone project with just `package.json`, `slides.md`, `code/`, and `public/images/logo.png` — no local `vite.config.ts` needed. The `codeurjc-slidev-theme` npm dependency provides the layout, editor, and all the authoring features documented below.

Two packages are published to npm under the `ivchicano` account:

- **[`codeurjc-slidev-theme`](https://www.npmjs.com/package/codeurjc-slidev-theme)** — the runtime Slidev theme (`theme: codeurjc-slidev-theme` in a presentation's frontmatter)
- **[`create-codeurjc-slidev`](https://www.npmjs.com/package/create-codeurjc-slidev)** — the scaffolding CLI used above

## Features

- Custom Slidev layouts with draggable overlays (red bar, logo, title, content)
- Layout editor integrated into Slidev's built-in SideEditor panel
- Drag/resize slide elements with undo support
- Save layouts as new `.vue` files or overwrite the current one
- Code-highlight callouts: mark a line/range/substring in a fenced code block with `// [!mark]`, get a draggable, auto-placed callout box
- Code-snippet import: `<<< @/code/path/to/File.java[selector] lang`, with the same highlight/callout markers declared in `slides.md` instead of the source file
- Slide title/subtitle carry-over across a run of same-topic slides
- Auto-fit text sizing, copy/paste image embedding with position presets, Mermaid diagram centering
- Urjc-themed UnoCSS preset (`urjc-red`, `urjc-green` colors)
- Unit tests (Vitest) and e2e tests (Playwright)

See `CLAUDE.md` for the full grammar/behavior reference (marker syntax, snippet-import selectors, title carry-over rules).

## Roadmap

- **Markdown-first authoring** — express both content and, as much as possible, styling choices (image placement, hidden titles, etc.) directly in slide frontmatter/markdown instead of hand-editing Vue.
- **Configurable layout, global + per-slide overrides** — e.g. image position (below vs. beside the text), collapsing the title so the image/code area expands to fill the freed space, and other layout knobs as they come up.
- **Code sync with real examples** — keep code shown in slides in sync with the actual example source (approach still to be explored).
- **Diagram support** — author diagrams with Mermaid or SVG, backed by an interactive editor.
- **Synthetic/boilerplate slides** — auto-generated slides that aren't hand-edited (cover, section index, license slide, etc.).

## Stack

- **Framework:** Vue 3 + TypeScript
- **Presentation:** Slidev 52
- **Styling:** UnoCSS
- **Unit tests:** Vitest 4 + jsdom + `@testing-library/vue`
- **E2e tests:** Playwright 1.61 (`@playwright/test`), Chromium
- **Package manager:** pnpm (workspace)

## Developing the theme itself

This repo is a pnpm workspace. The theme package lives in `packages/codeurjc-slidev-theme/`; the scaffolding CLI in `packages/create-codeurjc-slidev/`. The root `slides.md`/`code/` are dev/demo fixtures that consume the theme package exactly as an external project would (`theme: codeurjc-slidev-theme` + a `workspace:*` dependency), so they double as the theme's own dogfooding and regression-test target.

```sh
pnpm install
pnpm dev          # start slidev dev server on this repo's own slides.md (port 3030)
pnpm build        # build static slides
pnpm export       # export to PDF
pnpm test         # run the theme package's unit tests (vitest)
pnpm test:e2e     # run e2e tests (playwright, auto-starts server against e2e/slides.md)
```

### Project structure

```
codeurjc-slidev/
├── slides.md                              # This repo's own dev/demo presentation
├── code/                                  # Example code referenced by that presentation
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

### Development cycle

1. Edit the theme (`packages/codeurjc-slidev-theme/layouts/`, `composables/`, `setup/`, etc.)
2. Write/update tests (`packages/codeurjc-slidev-theme/composables/__tests__/` for unit, `tests/` for e2e)
3. Run `pnpm test && pnpm test:e2e`
4. Commit: `git add -A && git commit -m "message"`

Publishing a new version of either package: bump its `version` in `packages/<name>/package.json`, then `cd packages/<name> && npm publish --access public` (requires npm 2FA).
