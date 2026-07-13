# codeurjc-slidev

## Project overview

Collection of themes, layouts, addons, and hacks for creating Slidev presentations in the CodeURJC group. Includes a custom layout editor that lets you drag/resize slide elements (red bar, logo, title, content) and save layouts via a Vite dev server middleware.

**Architecture:**
- `slides.md` — presentation source (REST API in React topic)
- `layouts/default.vue` — reusable slide layout with draggable element overlays and code-highlight callouts
- `composables/useEditor.ts` — singleton state for element positions, undo, drag/resize, and save (fixed elements + dynamic per-slide keys, e.g. callouts)
- `composables/useCodeHighlights.ts` — marker syntax parsing + Shiki HTML post-processing for code-highlight callouts
- `composables/useHighlightLayout.ts` — pure geometry for callout auto-placement and elbow connector routing
- `setup/transformers.ts` — registers the code-highlight codeblock transformer with Slidev
- `_override/SideEditor.vue` — custom Slidev SideEditor override with a "Layout" tab
- `vite.config.ts` — Vite transform hook that injects the SideEditor override; `/api/save-layout` middleware that persists layout CSS variables; `/api/save-code-highlight-position` middleware that persists a dragged callout's position into `slides.md`

## Code-highlight callouts

Mark a line, line range, or substring inside a fenced code block, optionally with a comment that renders as a draggable callout box connected by an elbow connector. Syntax (a trailing comment on the target line, stripped from rendered output):

```java
public GestorNotas(DBAlumno alumnos) { // [!mark:ctor-dep] Injects the DB dependency
  this.alumnos = alumnos;              // [!mark:body(this.alumnos)] Just the substring
}
```

- **Line range:** share an id across `[!mark:<id>:start]` and `[!mark:<id>:end]` markers.
- **Substring:** add `(<exact text>)` after the id to highlight only that part of the line.
- **No comment:** omit the trailing text to apply just the highlight style, with no callout box.
- Callouts auto-place around the code block (right/left/below/above, whichever has room) and can be dragged to a new position in the layout editor (Layout tab); the dragged position is written back into the marker as `@x,y` (e.g. `[!mark:ctor-dep@120,40]`), so it persists across reloads and survives further edits to the code above it.
- Multiple highlights per code block are supported; callouts avoid overlapping the code block and each other.

## Stack

- **Framework:** Vue 3 + TypeScript
- **Presentation:** Slidev 52
- **Styling:** UnoCSS
- **Unit tests:** Vitest 4 + jsdom + `@testing-library/vue`
- **E2e tests:** Playwright 1.61 (`@playwright/test`), Chromium
- **Package manager:** pnpm

## Commands

```sh
pnpm install
pnpm dev                    # start slidev dev server (port 3030)
pnpm build                  # build static slides
pnpm export                 # export to PDF
pnpm test                   # run unit tests (vitest)
pnpm test:e2e               # run e2e tests (playwright, auto-starts server)
```

## Tests

- **Unit tests** (`vitest`): `pnpm test` — runs `composables/__tests__/*.spec.ts` in jsdom
- **E2e tests** (`playwright`): `pnpm test:e2e` — runs `tests/*.spec.ts` against a Chromium browser

The e2e `webServer` in `playwright.config.ts` auto-starts Slidev on port 3030 using `e2e/slides.md` as entry. The `e2e/` directory contains symlinks to the root files (`slides.md`, `layouts/default.vue`, `composables/*.ts`, `_override/SideEditor.vue`, `setup/transformers.ts`, `public/`) and its own `vite.config.ts`. Symlinks keep the e2e environment in sync with the root project, but `e2e/vite.config.ts` is **not** a symlink — it's a standalone copy (with adjusted `__dirname` paths) that must be manually kept in sync with root `vite.config.ts` whenever the `/api/save-layout`/`/api/save-code-highlight-position` middlewares or the `VAR_MAP` change, or e2e tests will silently exercise stale save/restore logic. All test modifications are restored by `afterAll` hooks.

## Development cycle

1. Implement feature (edit composables, layouts, or override components)
2. Write/update tests (`composables/__tests__/` for unit, `tests/` for e2e)
3. `pnpm test && pnpm test:e2e`
4. `git add -A && git commit -m "message"`
