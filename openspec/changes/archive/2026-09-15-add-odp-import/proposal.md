## Why

The CodeURJC courses already have dozens of LibreOffice Impress (`.odp`) decks. Moving one to this theme by hand — as was done for Tema 1.2's exercises in this repo's own `slides.md` — means retyping every title, bullet and code block, re-placing every image, and re-creating callouts. An importer that makes a best-effort conversion into a ready-to-run project turns that into reviewing and touching up. It also keeps the generated deck clean, and reports everything it couldn't convert separately.

## What Changes

- `create-codeurjc-slidev` gains an import mode, `--from-odp <file.odp>`, producing **one project per ODP**. It also accepts:
  - `--code <dir>` to point at the code folder explicitly;
  - `--code-repo <github-url>` to set the source-link base URL.
- **Slide structure.** Each ODP slide becomes one slide, in order.
  - Hidden ODP slides get `hide: true`.
  - Cover and copyright slides map to the theme's `cover` (date, subject, lesson, authors, title) and `copyright` layouts.
- **Titles.** They are detected from the title placeholder, or from a text shape in the top band of the slide (for PPTX-imported decks that have no placeholders).
  - A two-line title becomes `#` chapter + `##` subchapter, and an in-content heading then becomes `###`.
  - With a single-line title, the in-content heading (a list-header, or a lone bold first bullet whose children move up one level) becomes `##`.
  - Headings use the theme's title carry-over. Repeated values are omitted, and resets (bare `#`/`##`, or `resetTitle: true`) are emitted wherever a carried value must stop. The computation counts hidden slides too, because Slidev's parser runs carry-over on them as well.
- **Text.**
  - Bulleted lists keep their nesting, and empty spacer items are dropped.
  - Bold, italic, monospace (as inline code) and hyperlinks are preserved.
  - Link-only text boxes become a link below the content.
  - Plain tables become markdown tables.
- **Images.** Images are extracted to `public/images/` and positioned with the per-slide `geometry` frontmatter (from `add-slide-geometry-frontmatter`), including slides with several images.
- **Code.**
  - Monospace text shapes, and terminal-output boxes, become fenced code blocks. The language is inferred from content or a filename label, and a filename label becomes the block's title.
  - The ODP's code folder (a folder named like the ODP next to it, or `--code`) is copied into `<project>/code/`. The importer never clones anything.
  - A code block that exactly matches a file becomes a `<<<` import with a selector.
  - A near-match (elided or drifted code) stays an inline code block with a `// [!source …]` link to the near-matching file.
  - The source-link base URL comes from the code folder's git `origin` (nearest `.git`) or `--code-repo`, which wins. Imports get explicit `[!source …]` directives so links work even though `code/` is a plain copy.
- **Code annotations.**
  - Highlight rectangles that line up with code lines, plus their callout boxes, become `[!mark]` highlights with callout comments and `@x,y` positions.
  - Code build-ups (consecutive slides that each add a callout) merge into one slide using callout click steps (from `add-callout-click-steps`).
  - Build-ups that can't be converted stay separate slides, with a console warning.
- **Losses** (anything omitted or flattened) are logged to the console. `slides.md` never contains warnings.
- **Comparison deck.** When LibreOffice ≥ 7.4 is installed, a separate `comparison.md` is generated for only the slides that lost something.
  - Each entry shows the original slide (rendered from LibreOffice's SVG export, split per slide) and the list of losses.
  - It references the converted slide by its Slidev slide number, and pulls that slide in via `src:`.
  - Without LibreOffice, the deck is skipped and the console says why.
- **Generated project scripts:** `export` is `slidev export --with-clicks`, and a new `dev:compare` script opens the comparison deck.
- **Testing policy.** ODP test fixtures are never committed: `odp/` is gitignored, and tests that need the real decks skip with a warning when they're missing. CI coverage comes from small synthetic fixtures built in the tests. Docs note that the real fixtures are available from the author on request.

## Capabilities

### New Capabilities
- `odp-import`: converting an ODP's slides into this theme's markdown. Covers slide mapping, hidden slides, cover/copyright, title and heading detection with carry-over emission, lists and inline formatting, links, tables, images with geometry, build-up merging, and loss reporting.
- `odp-code-conversion`: code detection and language inference, locating and copying the code folder, exact-match `<<<` imports with selectors, near-match inline blocks with source links, source-link base URL resolution, and turning code annotations into highlight marks and callout click steps.
- `odp-comparison-deck`: LibreOffice detection, per-slide SVG rendering of originals, and the `comparison.md` deck of slides that lost content.

### Modified Capabilities
- `project-scaffolding`: the scaffolder can start a project from an ODP presentation (`--from-odp`, plus an interactive choice); imported projects export with click steps and get a `dev:compare` script.

## Impact

- `packages/create-codeurjc-slidev/`:
  - new TypeScript importer sources (`src/odp/`), bundled with esbuild into `dist/` for publishing;
  - `index.mjs` gains the import flags and prompt;
  - new dependencies `fflate` (unzip) and `@xmldom/xmldom` (ODF XML);
  - new `vitest` and `tsconfig.json` setup, added to the root `test`/`typecheck` scripts.
- `packages/codeurjc-slidev-theme/composables/useSnippetImport.ts`: gains the selector-choice rule (`computeSelectorForSelection`), moved from `packages/vscode-codeurjc-slidev/src/selectorFromSelection.ts` so the importer and the extension share it. The extension imports it from the theme instead.
- Reuses, without behavior changes: the theme's `useSourceLink.ts` (git root, remote and branch resolution) and `useSlideTitleCarryover.ts` (carry-state resolution, to simulate what Slidev will render).
- Depends on `add-slide-geometry-frontmatter` and `add-callout-click-steps` being implemented first.
- Optional external tool: LibreOffice ≥ 7.4 (`soffice`), only for the comparison deck.
- `.gitignore`: adds `odp/`.
- Docs: `CLAUDE.md` (the importer, and the fixtures-on-request note in Tests) and `packages/create-codeurjc-slidev/README` (usage, and the fixtures note).
