# codeurjc-slidev

## Project overview

Collection of themes, layouts, addons, and hacks for creating Slidev presentations in the CodeURJC group. Includes a custom layout editor that lets you drag/resize slide elements (red bar, logo, title, content) and save layouts via a Vite dev server middleware.

**Architecture:**
- `slides.md` — presentation source (REST API in React topic)
- `layouts/default.vue` — reusable slide layout with draggable element overlays and code-highlight callouts
- `composables/useEditor.ts` — singleton state for element positions, undo, drag/resize, and save (fixed elements + dynamic per-slide keys, e.g. callouts)
- `composables/useCodeHighlights.ts` — marker syntax parsing (inline trailing-comment markers **and** external anchor declarations, see "Code snippet import" below) + Shiki HTML post-processing for code-highlight callouts
- `composables/useHighlightLayout.ts` — pure geometry for callout auto-placement and elbow connector routing
- `composables/useSnippetImport.ts` — `<<< @/path[selector] lang` snippet-import parsing, selector resolution (line-range / content-anchor-range) against a file's text, and the code-root convention check
- `setup/transformers.ts` — registers a `pre` markdown-transformer that resolves `<<<` snippet imports (with slicing) into literal fenced code blocks before Slidev's own `<<<` handling ever sees them, plus the `codeblocks` transformer that renders highlights (from inline markers or external anchors) as callouts
- `_override/SideEditor.vue` — custom Slidev SideEditor override with a "Layout" tab
- `vite.config.ts` — Vite transform hook that injects the SideEditor override; `/api/save-layout` middleware that persists layout CSS variables; `/api/save-code-highlight-position` middleware that persists a dragged callout's position into `slides.md`

## Code-highlight callouts

Mark a line, line range, or substring inside a fenced code block, optionally with a comment that renders as a draggable callout box connected to the highlight by an elbow connector. Marks are written as a trailing comment on the target source line and are stripped from the rendered code (never shown to the audience). Parsing/rendering lives in `composables/useCodeHighlights.ts`; placement/routing lives in `composables/useHighlightLayout.ts`.

### Marker grammar

```
// [!mark[:start|:end][(<start>-<end>)][@<x>,<y>]] <comment>
```

- No id: presenters never name or reference a highlight, so one isn't part of the syntax — ids are generated internally (by encounter order within the code block) purely for DOM grouping and position bookkeeping.
- `<comment>` — everything after the closing `]`, trimmed. If empty, the fragment still gets the highlight style but no callout is rendered.
- The comment marker itself (`// [!mark...]`) is stripped entirely from what the audience sees; only `<comment>` (if any) shows up, inside the callout box.

### Forms

| Form | Syntax | Behavior |
|---|---|---|
| Whole line | `// [!mark] comment` | Highlights the entire line the marker is on. |
| Multi-line range | `// [!mark:start] comment` ... `// [!mark:end]` | Highlights every line from `:start` through `:end` inclusive, as one highlight/callout. The comment can go on either marker; if both have one, `:start`'s wins. Pairing is nearest-unclosed-start-first, like matching brackets, so ranges can nest. |
| Substring | `// [!mark(<start>-<end>)] comment` | Highlights only the character range `[<start>, <end>)` of that line (0-based, end-exclusive), not the whole line — count characters in the source line itself (including leading whitespace), not the rendered/Shiki-wrapped HTML. |
| Position override | append `@<x>,<y>` right before the closing `]`, e.g. `[!mark@120,40]` | Pins the callout's position instead of auto-placing it. Written automatically when you drag a callout in the editor (see below) — you normally don't type this by hand. |

### Example

```java
public GestorNotas(DBAlumno alumnos) { // [!mark] Injects the DB dependency
  this.alumnos = alumnos;              // [!mark(2-16)] Just the substring
}
```

### Callout placement and dragging

- Callouts auto-place around the code block (right → left → below → above, first side that fits), sized to their comment text (capped at a max width, wrapping/growing taller for longer comments) rather than a fixed box.
- The obstacle used for placement is the *actual code lines'* bounding box, not the `<pre>` element's full container width — a `<pre>` typically stretches wider than its longest line, and that leftover space is still fair game for a callout.
- When a side is already occupied by another callout on the same code block, a new callout shelf-stacks along that side (closest open slot to its own highlight) instead of jumping to a worse side.
- In editor mode (Layout tab), drag a callout to override its position; the dragged position is written back into the marker as `@x,y` (e.g. `[!mark@120,40]`) via the `/api/save-code-highlight-position` endpoint, so it persists across reloads and survives further edits to the code above it.
- Multiple highlights per code block are supported; callouts avoid overlapping the code block, each other, and (best-effort, via a bounds-clamped fallback) the edges of the slide itself.

## Code snippet import

Reference code from the `code/` directory (a runnable set of exercise/example projects) directly in a slide, instead of copy-pasting it into `slides.md`. The referenced file is read live and re-rendered when it changes, and stays completely clean — no marker, region, or other slide-only syntax is ever written into it. Slicing and highlighting are declared entirely in `slides.md`. Parsing/slicing lives in `composables/useSnippetImport.ts`; the `pre` markdown-transformer that wires it up lives in `setup/transformers.ts`.

### Import + selector grammar

```
<<< @/code/path/to/File.java[selector] lang
```

- No selector — shows the whole file.
- `[N-M]` — absolute line range (1-based, inclusive) from the file.
- `["first line text".."last line text"]` — content-anchor range: from the line containing the first text through the line containing the second, inclusive, searched against the whole file. Falls back to the whole file (with a console warning) if either anchor text isn't found.
- The code root (default `code/`) is a single configured convention; a `<<<` import resolving outside it logs a console warning (not a build failure).

### Anchor grammar (highlights/callouts on imported snippets)

Since the imported file can't carry `// [!mark]` comments, highlights are declared as standalone lines in `slides.md` immediately following the `<<<` import — one per line, each targeting a fragment of the *rendered* (post-selector) snippet:

| Form | Syntax | Behavior |
|---|---|---|
| Line | `[!mark:N] comment` | Highlights line `N` (1-based, within the snippet as shown). |
| Line range | `[!mark:N..M] comment` | Highlights lines `N` through `M` inclusive. |
| Content | `[!mark:"text"] comment` | Highlights exactly `text` (plain substring search), not the whole line it's on. |
| Content + substring | `[!mark:"text"(<start>-<end>)] comment` | Overrides the default to highlight characters `[<start>, <end>)` of the matched line instead of the anchor text's own span. |
| Content range | `[!mark:"a".."b"] comment` | Highlights from the line containing `a` through the line containing `b`, inclusive. |
| Content + offset range | `[!mark:"a"+N] comment` | Highlights the matched line through `N` lines after it. |
| Occurrence selector | append `#N` or `#*` to a content anchor | `#N` picks the Nth match (1-based); `#*` highlights every match, each with its own callout. |
| Position override | append `@<x>,<y>` right before the closing `]` | Same convention as inline markers — written automatically when dragging a callout. |

Degradation is intentional and non-fatal: an anchor whose text isn't found is skipped (console warning); an ambiguous anchor with no occurrence selector highlights the first match (console warning); an explicit `#N` past the match count is an authoring error, reported rather than silently falling back.

### Example

```
<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-24] java
[!mark:"public GestorNotas(DBAlumno alumnos)"] Injects the DB dependency
[!mark:"getNotasAlumno(idAlumno)"] Fetches the student's grades
[!mark:"float suma = 0.0f;".."return suma / notas.size();"] Sums up the notes
```

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

The e2e `webServer` in `playwright.config.ts` auto-starts Slidev on port 3030 using `e2e/slides.md` as entry. The `e2e/` directory contains symlinks to the root files (`slides.md`, `layouts/default.vue`, `composables/*.ts`, `_override/SideEditor.vue`, `setup/transformers.ts`, `public/`, `code/`) and its own `vite.config.ts`. Symlinks keep the e2e environment in sync with the root project — every new file added to `composables/` needs its own symlink under `e2e/composables/` or the e2e Slidev instance will fail to resolve it (`Cannot find module`). `e2e/vite.config.ts` is **not** a symlink — it's a standalone copy (with adjusted `__dirname` paths) that must be manually kept in sync with root `vite.config.ts` whenever the `/api/save-layout`/`/api/save-code-highlight-position` middlewares or the `VAR_MAP` change, or e2e tests will silently exercise stale save/restore logic. All test modifications are restored by `afterAll` hooks.

## Development cycle

1. Implement feature (edit composables, layouts, or override components)
2. Write/update tests (`composables/__tests__/` for unit, `tests/` for e2e)
3. `pnpm test && pnpm test:e2e`
4. `git add -A && git commit -m "message"`
