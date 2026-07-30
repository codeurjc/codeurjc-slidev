# codeurjc-slidev

## Project overview

A Slidev **theme** for CodeURJC presentations, published to npm as `codeurjc-slidev-theme`, plus a scaffolding CLI (`create-codeurjc-slidev`) for starting new presentations without cloning this repo. This repo itself is the theme's development, demo, and regression-test environment: its own `slides.md`/`code/` consume the theme package the same way an external consumer would (`theme: codeurjc-slidev-theme` frontmatter + a `workspace:*` dependency), via a pnpm workspace.

Includes a custom layout editor that lets you drag/resize slide elements (red bar, logo, title, content) and save layouts via a Vite dev server middleware.

**Workspace layout:**
- `slides.md`, `code/` — this repo's own dev/demo presentation and referenced example code (NOT shipped to consumers — a scaffolded project starts with its own empty `code/`)
- `packages/codeurjc-slidev-theme/` — the published theme package (`.vue`/`.ts` source shipped unbuilt, per Slidev's no-build theme convention)
- `packages/create-codeurjc-slidev/` — the published scaffolding CLI (`index.mjs` + a bundled `template/` directory)
- `packages/vscode-codeurjc-slidev/` — VSCode extension providing editor support for this theme's custom `slides.md` grammar (see "VSCode editor support" below)
- `openspec/` — OpenSpec change proposals

**Theme package architecture** (`packages/codeurjc-slidev-theme/`):
- `layouts/default.vue` — reusable slide layout with draggable element overlays and code-highlight callouts
- `composables/useEditor.ts` — singleton state for element positions, undo, drag/resize, and save (fixed elements + dynamic per-slide keys, e.g. callouts)
- `composables/useCodeHighlights.ts` — marker syntax parsing (inline trailing-comment markers **and** external anchor declarations, see "Code snippet import" below) + Shiki HTML post-processing for code-highlight callouts
- `composables/useHighlightLayout.ts` — pure geometry for callout auto-placement and elbow connector routing
- `composables/useSnippetImport.ts` — `<<< @/path[selector] lang` snippet-import parsing, selector resolution (line-range / content-anchor-range, now also reporting the resolved 1-based line numbers) against a file's text, the code-root convention check, and `[!source ...]` directive-line parsing (see "Code source links" below)
- `composables/useSourceLink.ts` — GitHub `origin`-remote detection (walking up to the nearest `.git` from the imported file, resolving symlinks first), default-branch resolution, and GitHub source-URL assembly; git access is injected so it's unit-testable without a real repo
- `composables/useSlideTitleCarryover.ts` — leading-heading parsing, the per-level (title/subtitle) carry-chain resolver, and heading injection for slide title/subtitle carry-over (see "Slide title carry-over" below)
- `setup/transformers.ts` — registers a `pre` markdown-transformer that resolves `<<<` snippet imports (with slicing) into literal fenced code blocks before Slidev's own `<<<` handling ever sees them, plus the `codeblocks` transformer that renders highlights (from inline markers or external anchors) and source-link icons as callouts/title decorations
- `setup/preparser.ts` — registers a `transformSlide` preparser extension that injects carried title/subtitle headings into a slide's content and syncs the result into Slidev's own parsed `slide.title`
- `_override/SideEditor.vue` — custom Slidev SideEditor override with a "Layout" tab
- `vite.config.ts` — Vite transform hook that injects the SideEditor override; `/api/save-layout` middleware that persists layout CSS variables; `/api/save-code-highlight-position` middleware that persists a dragged callout's position into `slides.md`. Consumer-owned paths (`layouts/` write target, `slides.md`) resolve against Vite's `server.config.root` (the consuming project's root), never against `import.meta.dirname` (this plugin file's own location inside `node_modules`) — package-owned paths (`_override/SideEditor.vue`, the fallback `layouts/default.vue` template) stay `import.meta.dirname`-relative. The save-layout middleware falls back to reading the theme's own bundled layout when a consumer has no local override yet, and always writes back into the consumer's `layouts/`, creating a consumer-local override from the first edit onward.

Slidev auto-loads a theme package's `vite.config.ts`, `layouts/`, `setup/`, and `components/` by globbing every root in `[...theme/addon roots, userRoot]` — a consumer needs zero local Vite config for any of this to work.

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
- The rendered code block's title bar (Slidev's native `` ```lang [title] `` fence mechanism, via the built-in `CodeBlockWrapper`) shows the imported file's basename (e.g. `GestorNotas.java`) by default. Append `notitle` after the language to suppress it: `<<< @/code/path/to/File.java[selector] lang notitle`. No file-type icon is forced for languages absent from Slidev's built-in icon map (e.g. `.java`) — the title still renders, just without an icon.

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

## Code source links

A code block can carry a clickable link back to its real source: beside the title when one is shown, or in a row along the bottom of the slide otherwise. Resolution lives in `composables/useSourceLink.ts`; directive/marker parsing lives in `composables/useSnippetImport.ts` (imports) and `composables/useCodeHighlights.ts` (manual fences); wiring and rendering-placement decisions live in `setup/transformers.ts`; the bottom row lives in `layouts/default.vue`.

### Imported snippets: auto-detected, directive-overridable

A `<<<` import whose file lives under a git repo with a `github.com` `origin` remote gets a source link automatically — no authoring required. The linked branch is `codeSourceLinkBranch` from the deck's own frontmatter if set, else the repo's actual default branch: first the local `refs/remotes/origin/HEAD` symref (`git symbolic-ref`), and if that's unset (only `git clone` itself, or an explicit `git remote set-head origin -a`, ever writes it — a repo assembled via `init`+`remote add`+`fetch` won't have it) falling back to asking the remote directly (`git ls-remote --symref origin HEAD`). With none of those available, no link is added. The link is deep-linked to the shown line range (`#L<start>-L<end>`), or has no fragment for a whole-file import.

A `[!source ...]` directive line, placed immediately after the `<<<` line (in the same position as `[!mark:...]` anchor-declaration lines, and freely interleavable with them):

| Form | Syntax | Behavior |
|---|---|---|
| Default | `[!source]` | Auto-detected link (the default even with no directive line at all). |
| Override | `[!source https://...]` | Replaces the auto-detected URL. |
| Suppress | `[!source none]` | No link is rendered for this import, even if one would auto-detect. |
| Force bottom | `[!source bottom]` | Renders in the bottom row instead of beside the title, keeping whatever URL would otherwise apply. |
| Force bottom + override | `[!source bottom https://...]` | Both at once. |

### Manual (non-imported) fences: opt-in only

A hand-typed fenced code block has no backing file, so no auto-detection is possible. A standalone `// [!source https://...]` (or `#`-comment) marker line inside the fence attaches a link manually; it's stripped from the rendered code, same as `[!mark]` markers. With no marker, there's no link.

### Placement

- A visible title (an import's basename, or a manual fence's own `[title]`) with no `bottom` override → the link renders as a small clickable icon beside the title text.
- No visible title (`notitle`, or a manual fence with no `[title]`), or `bottom` set → the link renders instead as an icon in a row along the bottom of the slide. Multiple such blocks on one slide each get their own icon in that row (hover shows the source file/URL); there's no connector line back to the originating block, unlike code-highlight callouts.

## Slide title carry-over

On `default`-layout slides, a missing leading `# Title` / `## Subtitle` is inherited from the nearest preceding `default`-layout slide that set one, so a run of slides sharing a title doesn't need it retyped on every one. Title and subtitle are tracked as two independent carry chains. Resolution/injection logic lives in `composables/useSlideTitleCarryover.ts`; it's wired up as a `transformSlide` preparser extension in `setup/preparser.ts` — which runs as part of parsing `slides.md` itself, so the carried heading is injected directly into the slide's content (what the dev server/build actually renders) and also feeds back into Slidev's own parsed `slide.title` (used by the presenter overview / table of contents).

### Detection rule

Only the *leading* heading lines of a slide's content count as "own": an optional `# ...` line, immediately followed (no blank line) by an optional `## ...` line. A heading anywhere else in the slide body is not part of this — it mirrors `layouts/default.vue`'s `h1:first-child` styling convention, not Slidev's own looser "first heading anywhere" title detection.

### Resetting the chain

| Trigger | Effect |
|---|---|
| A slide's own `# ...` (or `## ...`) | Starts a new value for that level, carried forward from there. |
| An empty heading — bare `#` (or `##`), no text | Clears that level's chain from that slide forward, until a new explicit heading of that level appears. |
| `resetTitle: true` in a slide's frontmatter | Clears **both** the title and subtitle chains at once, as an alternative to writing two empty headings. Can be combined with the same slide also setting its own new heading. |

Only `default`-layout slides participate: a slide using any other layout (e.g. `layout: cover`) is skipped over — it neither contributes to nor breaks the chain for the `default`-layout slides around it.

### Example

```
---
layout: default
---

# Ejercicios

Slide 1: sets the title.

---

Slide 2: no heading — carries "Ejercicios".

---

## Ejercicio 2

Slide 3: still carries "Ejercicios", sets its own subtitle.

---

#

Slide 4: empty title — no title here, and none on slides after until a new one is set.
```

## VSCode editor support

`packages/vscode-codeurjc-slidev/` is a VSCode extension that previews this theme's grammar directly in the editor, without running the Slidev dev server. It reuses the theme package's composables verbatim (`workspace:*` dependency, deep imports like `codeurjc-slidev-theme/composables/useCodeHighlights`) rather than reimplementing the grammar — activation is gated on a document's frontmatter declaring `theme: codeurjc-slidev-theme` (`src/themeGate.ts`), so it stays inert for unrelated markdown.

- `src/documentScan.ts` — shared raw-text scanning: fenced code blocks, `<<<` import + directive-line blocks, and slide-number counting (by `---` separators, skipping the frontmatter's own pair).
- `src/markerDecorations.ts` — pure translation from a fence's marker/highlight parsing (via `parseCodeHighlights`) to document-absolute line/character positions, for dimming marker text and boxing highlighted spans in the open buffer.
- `src/importAnalysis.ts` — hovers and diagnostics for `<<<` imports and their anchor/`[!source]` directive lines, reusing `resolveSnippetSelector` and `parseExternalHighlightAnchors`'s `onWarn`/`onError` hooks (each anchor line is resolved individually so a diagnostic can be attached to its exact line). Reading the imported file is injected (`ResolveImport`), so this stays testable without touching disk.
- `src/referenceIndex/` — the reverse-reference feature: `indexBuilder.ts` builds, per target file, a *recipe* of which slide/anchor-line/selector combinations reference it (no file reads, no absolute line numbers yet); `codeLens.ts` resolves those recipes against a target file's live editor text on demand, so an edit to the target file alone is reflected immediately without any index invalidation — only an edit to the markdown file itself requires rebuilding that file's contribution (`updateReferenceIndexForFile`). `scanner.ts` is the only fs-touching part (workspace enumeration + `@/...` path resolution against the code-root convention).
- `src/extension.ts` — thin adapter wiring the above to real `vscode` decorations/Hover/Diagnostic/CodeLens providers; deliberately not unit tested itself (see Tests below).

Adding a small new marker/anchor form to the theme's grammar should not require touching this package's parsing logic at all — only `documentScan.ts`'s directive-line detection (if the new form isn't `[!mark:...]`/`[!source ...]`-shaped) would need updating.

## Stack

- **Framework:** Vue 3 + TypeScript
- **Presentation:** Slidev 52
- **Styling:** UnoCSS
- **Unit tests:** Vitest 4 + jsdom + `@testing-library/vue`
- **E2e tests:** Playwright 1.61 (`@playwright/test`), Chromium
- **Package manager:** pnpm (workspace — root + `packages/*`)

## Commands

```sh
pnpm install
pnpm dev                    # start slidev dev server on this repo's own slides.md (port 3030)
pnpm build                  # build static slides
pnpm export                 # export to PDF
pnpm test                   # run the theme package's + vscode extension's unit tests (vitest)
pnpm test:e2e               # run e2e tests (playwright, auto-starts server)
pnpm test:extension         # run the vscode extension's extension-host smoke tests (@vscode/test-electron)
```

## Tests

- **Unit tests** (`vitest`): `pnpm test` (delegates to `pnpm --filter codeurjc-slidev-theme --filter vscode-codeurjc-slidev test`) — runs `packages/codeurjc-slidev-theme/composables/__tests__/*.spec.ts` in jsdom, and `packages/vscode-codeurjc-slidev/src/**/__tests__/*.spec.ts` in plain Node (no `vscode` module dependency at this layer — the extension's decoration/hover/CodeLens *logic* returns plain data shapes, converted to real `vscode.Range`/`Hover`/etc. only in the thin `src/extension.ts` adapter)
- **E2e tests** (`playwright`): `pnpm test:e2e` — runs `tests/*.spec.ts` against a Chromium browser
- **VSCode extension-host smoke tests** (`@vscode/test-electron` + Mocha): `pnpm test:extension` — downloads/launches a real VSCode build against the fixture workspace at `packages/vscode-codeurjc-slidev/test-extension/fixture/`, asserting the extension activates, registers its command, and that hovers/CodeLens actually render end-to-end. Needs a display: on a headless machine (including this repo's own sandboxed dev environment) run it under `xvfb-run -a pnpm test:extension` — plain `pnpm test:extension` fails with a Chromium "unresponsive window" error with no display server available. This is a deliberately thin smoke layer (see `packages/vscode-codeurjc-slidev/`'s design rationale) — grammar edge cases belong in the vitest layer above, not here.

The e2e `webServer` in `playwright.config.ts` auto-starts Slidev on port 3030 using `e2e/slides.md` as entry. `e2e/slides.md` declares `theme: codeurjc-slidev-theme`, so the theme package (resolved via the pnpm workspace link in `node_modules`) auto-loads through Slidev's own roots-merge — `e2e/` no longer needs symlinks to the theme's `composables/`/`setup/`/`_override/`/`layouts/`/`global-top.vue`/`vite.config.ts` (all removed; only the `code/` and `public/` symlinks remain, since those are e2e-specific asset fixtures unrelated to the theme). `e2e/layouts/` is intentionally not seeded with `default.vue` — the theme's own bundled layout is Slidev's fallback until an e2e test's save-layout call creates a consumer-local override, which is itself exercised as test coverage (see `tests/vite-consumer-root-resolution.spec.ts` and the fallback-handling tests in `tests/layout-editor.spec.ts`/`tests/image-position.spec.ts`). All test modifications are restored by `afterAll` hooks. Every `*.spec.ts` fixture that wholesale-replaces `e2e/slides.md`'s content must include `theme: codeurjc-slidev-theme` in its frontmatter — omitting it causes Slidev's "restarting on theme change" behavior to flap the dev server and cascade connection failures across later tests in the same run.

Most spec files still share the single `legacy`-project dev server above (hence `workers: 1`, since they race on `e2e/slides.md`). `tests/autofit-text.spec.ts` and `tests/code-snippet-import.spec.ts` are migrated onto the `isolated` project instead: `tests/fixtures.ts` gives each Playwright *worker* (not each file) its own throwaway copy of `e2e/` at `<repo-root>/.e2e-worker-<index>/` (must sit at the same directory depth as `e2e/` itself, directly under the repo root — one level of extra nesting silently breaks `@/../`-escaping imports like the one `code-snippet-import.spec.ts` uses to test the code-root-escape warning) plus its own Slidev dev server, booted via `@slidev/cli`'s programmatic `resolveOptions`/`createServer` (the same calls `npx slidev` itself makes) rather than spawning a CLI subprocess. **Critically**, `createServer`'s third argument must include a `loadData` hook — without one, its internal `handleHotUpdate` silently no-ops on every file change (confirmed by reading `@slidev/cli`'s own `cli.mjs`, since this isn't in the public `.d.mts` types), so writes to the worker's `slides.md` would never re-render. Migrating the remaining shared-state spec files onto this pattern (and then dropping `legacy`/`workers: 1`) is tracked as follow-up work, not yet done.

## Development cycle

1. Implement feature (edit theme files under `packages/codeurjc-slidev-theme/composables/`, `layouts/`, `setup/`, or `_override/`)
2. Write/update tests (`packages/codeurjc-slidev-theme/composables/__tests__/` for unit, `tests/` for e2e)
3. `pnpm test && pnpm test:e2e`
4. `git add -A && git commit -m "message"`
5. To publish a new version of the theme or CLI package: bump `version` in `packages/<name>/package.json`, then `cd packages/<name> && npm publish --access public` (requires npm 2FA — the browser-based OTP-approval flow, not the classic `--otp=<code>` flag, worked reliably here). Must be run from the package's own directory, not the repo root (the root `package.json` is `private: true` with no `version` field and will crash `npm publish`'s prerelease check if run from there).
6. To publish a new version of the VSCode extension: bump `version` in `packages/vscode-codeurjc-slidev/package.json`, then from that directory `pnpm run package` (production esbuild bundle to `dist/extension.cjs`) followed by `npx vsce publish` — a separate credential/2FA flow from npm's (a VSCode Marketplace publisher access token, not an npm OTP).
