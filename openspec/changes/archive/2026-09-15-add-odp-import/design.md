## Context

**Input corpus.** 11 real CodeURJC decks (694 slides) were analyzed during exploration. They fall into three families:

| Family | Decks | Structure |
|---|---|---|
| Placeholder frames | Tema 1.1, 1.3, 2.1, 2.2, 2.5, Artefactos | `presentation:class="title"`/`"outline"` frames on the `codeurjc_` master |
| `codeurjc_final_` master | GitHub Actions, Azure | Title frame plus many loose text boxes and empty spacer frames |
| PPTX-imported | Tema 1.2, Selenium, Docker | No title/outline frames; everything is `draw:custom-shape` rectangles |

**Recurring patterns**:
- Every deck hides slide 1: an alternate-course cover.
- Two-line titles appear only in Tema 1.1.
- In-content headings (list-headers, or a lone bold first bullet) appear on 149 slides.
- Code in monospace shapes (130 blocks) is syntax-colored per span. Terminal boxes use Arial.
- Filename labels are rare (6).
- Highlight rectangles and arrow callouts are used on code (18 rectangles, 11 aligned to lines) and on screenshots.
- 4:3 pages of 25.4×19.05 or 28×21 cm.

**Code folders.** They sit next to the ODPs (`odp/<deck name>/`) and mirror `github.com/codigus-formacion/pruebas`. Matching Tema 1.2's 64 multi-line blocks gave 22 exact, 19 elided, 12 drifted and 11 unmatched. The folders aren't git checkouts.

**Verified Slidev behavior (52.19.1)**:
- `@slidev/parser`'s `load()` skips slides with `hide`/`disabled` after parsing. Preparser `transformSlide` (title carry-over) runs on every slide in `parse()`, hidden ones included.
- `src: file.md#range` indexes the imported file's *parsed* slides, hidden ones included, and each imported file is parsed as a whole.
- `slidev export --with-clicks` exists.

**Verified LibreOffice behavior**:
- 25.8 `--convert-to png` ignores page-selection filter options (six variants tested), so it can't render a chosen slide.
- `--convert-to svg` emits all *visible* slides in one SVG: `ooo:meta_slide` entries map slide group id → master id, and each slide group keeps the ODP page name (`ooo:name="page5"`).
- A per-slide split (shared `<defs>` + `<use>` of the master + the slide group, script removed) renders in Chromium matching LibreOffice's own raster output, except for font substitution.

**Existing reusable code**:
- `useSnippetImport.ts` (selector serialization and resolution, source directives);
- `useSourceLink.ts` (`findGitRoot`, `parseGitHubRemote`, branch resolution with an injectable `GitRunner`);
- `useSlideTitleCarryover.ts` (`advanceCarryState`);
- `vscode-codeurjc-slidev/src/selectorFromSelection.ts` (`computeSelectorForSelection`);
- `create-codeurjc-slidev/index.mjs` (plain ESM, minimal dependencies, copies `template/`).

## Goals / Non-Goals

**Goals:**
- A best-effort ODP → project conversion covering the corpus families: titles and headings with carry-over, lists and inline formatting, links, tables, images with geometry, code (imports, inline, annotations), build-ups as click steps, hidden and cover/copyright slides.
- A clean `slides.md`; losses to the console and, when LibreOffice ≥ 7.4 is available, a separate `comparison.md` of only the affected slides.
- Deterministic, unit-testable conversion stages, with the real decks as optional local fixtures.

**Non-Goals:**
- PPTX or other formats; ODP decks outside the three observed families beyond best effort.
- Converting diagrams, arrows on images, charts, OLE objects, animations other than build-ups, transitions, or speaker notes (the corpus notes are template leftovers).
- Cloning repositories, or fetching anything over the network.
- Importing several ODPs into one project.
- Pixel-faithful typography; the theme's own styles apply.

## Decisions

### Packaging and runtime

- **TypeScript sources in `packages/create-codeurjc-slidev/src/odp/`, bundled with esbuild into `dist/odp-import.mjs`** (`prepack` script, `files` gains `dist`). `index.mjs` `import()`s the bundle only when `--from-odp` is used, so the plain scaffold path keeps its current startup and dependencies.
- The bundle *inlines* the theme composables it reuses, because the theme ships unbuilt TypeScript that Node can't import from a published CLI. The same approach is already used for the VSCode extension's esbuild bundle.
- Alternatives:
  - Rewrite the importer in plain `.mjs`: duplicates parser, selector and carry-over logic, which would drift.
  - Depend on the theme package at runtime: needs a TypeScript loader in the CLI.

- **Dependencies: `fflate` (unzip) and `@xmldom/xmldom` (namespace-aware DOM).** ODF text is mixed content (`text:p` → `text:span`, `text:s`, `text:tab`, `text:line-break`, `text:a`) whose *order* matters. Object-mapping XML parsers such as `fast-xml-parser` lose or complicate that order. Both libraries are pure JS with no native builds.

- **Share the selector rule by moving `computeSelectorForSelection` into the theme's `useSnippetImport.ts`.** The VSCode extension imports it from there. The two users (the "Copy Selector" command and the importer) then choose selectors identically.

### Conversion pipeline

```
.odp ──unzip──▶ content.xml + styles.xml + Pictures/
        │
   parse (xmldom) ──▶ OdpDeck { pageSize, masters, styles, slides[ { index, name, hidden, shapes[] } ] }
        │              shape = { kind, geometry (cm, normalized to page), paragraphs[] (runs with effective style), image, table, endpoints }
   classify      ──▶ per shape: title | body | code | codeLabel | link | image | table | annotationRect | callout | connector | loose | decoration | spacer
        │              per slide: cover | copyright | content
   build model   ──▶ SlideModel { layout, frontmatter, title[1..2], inContentHeading, blocks[], images[], codeBlocks[], marks[], losses[] }
        │
   code match    ──▶ exact → import, near → inline + source, none → inline   (needs code folder + base URL)
   annotations   ──▶ marks with ranges/comments/@x,y
   build-ups     ──▶ merge convertible runs, assign {k} / v-click
   emit          ──▶ slides.md (carry-over-minimized headings), public/images, code/, package.json
   comparison    ──▶ (LibreOffice ≥ 7.4 && losses) SVG export → split → comparison.md
```

- Every stage except I/O (zip read, file writes, `soffice`, `git`) is a pure function over plain data, tested with vitest. External tools are injected (a `GitRunner` reused from the theme; an `OfficeRunner` for `soffice`) so tests don't need them.

- **Effective style resolution.** A run's bold, italic, monospace and font size are resolved by walking the style chain: span style → paragraph style → shape text style → presentation/graphic style parents in `content.xml` automatic styles and `styles.xml`. Font names are resolved through `style:font-face` declarations. Monospace means the font family matches a known list (JetBrains Mono, Consolas, Courier/Courier New/Courier 10 Pitch, Monospace/Monospaced, DejaVu/Liberation/Droid Sans Mono, Menlo, Fira Code, Source Code Pro, Ubuntu Mono).

### Classification heuristics (tuned on the corpus)

- **Cover.** Among the first three slides: a slide with no title placeholder, a subject text frame at 30–45% height, two outline frames (lesson, then title), a date shape in the top-right, and an authors shape in the bottom band.
- **Copyright.** Text starting with `©`.
- **Title.** The `presentation:class="title"` frame. Otherwise the topmost non-monospace text shape of at most two lines whose top edge is within the top 20% of page height and whose text is ≤ 90 characters. Two paragraphs, or a `text:line-break`, make a two-line title.
- **Body.** The `outline` frame. Otherwise the largest text shape containing a `text:list` below the title band.
- **In-content heading.** The body's leading `text:list-header` paragraph(s), a first-level list item whose runs are all bold and which has sub-items or is the body's only item, or a leading bold unlisted paragraph followed by a list. A bold first item followed by sibling items is not a heading: agenda slides bold their current section that way.
- **Spacers.** Empty text frames and empty list items are ignored without being reported.
- **Link box.** A non-body text shape whose text equals the concatenated text of its `text:a` elements (± whitespace).
- **Code label.** A monospace or plain text shape matching `^[\w.-]+\.\w{1,10}$` (or a project label like `ejem1`), placed on an edge of a code shape. Project labels (`ejem\d+\w*`, `ejer\d+\w*`) are kept as code-matching hints and are not rendered.
- **Annotation rectangle.** An empty `ooxml-rect`/`rectangle` shape overlapping a code shape but not equal to its bounds (± 0.3 cm).
- **Callout.** A text shape outside the body connected by a `draw:line`/`draw:connector` (endpoint within 0.5 cm of both), or a short text shape placed inside or on the edge of an annotation rectangle.
- **Decoration** (loss). Arrows (`*arrow*`, `mso-spt32`, `ooxml-non-primitive`), lines not used as callout connectors, filled shapes with text outside the body, groups, OLE objects and charts. The thin red top bar and date shapes on cover masters are ignored.
- **Loose text** (flattened + loss). Any remaining text shape: emitted as paragraphs after the body.

### Headings with carry-over

- The model records each slide's *desired* title and subtitle.
- Emission simulates the theme's carry-over by calling `advanceCarryState` from `useSlideTitleCarryover.ts` over the emitted slides in file order, **including hidden slides**, because Slidev runs the preparser before hide filtering.
- For each slide it writes the minimum headings for which the simulated result equals the desired values:
  - a heading is omitted when it equals the carried value;
  - a bare `#`/`##` is written to clear one level;
  - `resetTitle: true` is used when both levels clear.
- Reusing the theme's own resolver guarantees identical semantics, instead of re-implementing the rules.

### Geometry mapping

- ODP coordinates (cm) are mapped per axis from the template's default body region to the theme's default content box (x 31, y 98, w 901, h 424 px on the 980×551 canvas):
  - `px = 31 + (x_cm − bodyX) × 901 / bodyW`, and likewise for y.
  - `bodyX/Y/W/H` come from the master page's `outline` placeholder frame when present, otherwise from the corpus default (1.27, 4.46, 22.86, 12.7 cm on 25.4-wide pages, scaled for 28-wide pages).
  - Results are clamped to the canvas.
- Image boxes use `object-fit: contain` (from `add-slide-geometry-frontmatter`), so the independent axis scales don't distort images.
- `geometry.content` is emitted only when the body frame differs from the master's body region by more than 0.5 cm on any edge, e.g. narrowed beside an image.
- Title, logo and red bar are left to the theme.

### Code matching and source links

- **Normalization.** Remove all whitespace per line; unify typographic quotes; drop blank lines. `…`/`...` lines mark elision.
- **Classification.**
  - *exact*: all block lines match a single contiguous run of non-blank file lines;
  - *near*: at least 50% of lines matched in order (longest-common-subsequence over normalized lines);
  - *none*: otherwise.
- **File index.** Built once per import over the copied `code/` tree (excluding build dirs, files > 300 KB, and non-text extensions).
- **Tie-breaking** among equally scoring files: path contains the slide's project label → shortest path → lexicographic.
- **Selector.** The exact match's file line span is mapped back to real 1-based line numbers (blank lines included), then passed to the shared `computeSelectorForSelection`. A whole-file span gets no selector.
- **Base URL.**
  - `--code-repo` is parsed as `github.com/<owner>/<repo>[/tree/<branch>/<subpath>]`; a missing branch is resolved like the theme does, using `git ls-remote --symref`, only when the flag omits it.
  - Otherwise `findGitRoot` runs from the *source* code folder (before copying), with `parseGitHubRemote` and the theme's branch resolution; the code folder's path relative to the repo root becomes the subpath. A folder git ignores (`git check-ignore`) gets no base, since it isn't on the remote: e.g. the `odp/` fixture folders inside this repo.
  - File URLs are `https://github.com/<owner>/<repo>/blob/<branch>/<subpath>/<relative path>#L<a>-L<b>`.
- **Why explicit directives.** The theme's automatic link detection needs a `.git` above each imported file, and the copied `code/` has none. Writing explicit `[!source <url>]` directives and `// [!source <url>]` markers keeps links correct without cloning.

### Annotations → marks

- **Line geometry.**
  - Font estimate = dominant run font size × 1.17 (the corpus' 115%-ish line spacing).
  - Box estimate = (shape height − top and bottom padding) / line count. LibreOffice grows text shapes to fit their text, so when the box estimate is within 0.85–1.25× the font estimate it is used; otherwise (a fixed-height box) the font estimate is used. The font estimate alone drifted by a line or more near the bottom of long workflows.
  - Padding from the graphic style's `fo:padding-top`/`fo:padding-bottom` (default 0.125 cm).
- **Line selection.** A rectangle covers the non-blank lines whose vertical centers lie inside it by at least 0.15 line height. Authors pad highlight boxes generously and unevenly, so matching edges to line boundaries (the first approach, with a 0.35-line tolerance) rejected most corpus boxes. A rectangle containing no line center is a "not aligned" loss.
- **Substring columns.** A one-line rectangle narrower than 70% of the block gets columns from monospace advance ≈ 0.6 × font size, snapped to the nearest token boundaries of that line.
- **Labels.** A short text (≤ 40 characters) whose center lies inside a rectangle and whose top is within 1.2 cm of the rectangle's top is its label comment. Rectangles are processed smallest first, so a label inside nested boxes goes to the innermost box it tops.
- **Code frames.** A rectangle covering ≥ 90% of a code shape is a frame around the code, not a highlight. With a label (e.g. "WORKFLOW") it becomes a whole-block range; without one it's ignored silently.
- **Pairing.** Connector endpoints (`svg:x1/y1/x2/y2`, or custom-shape bounds for arrow shapes) → rectangle and callout within 0.5 cm. A remaining connector from a text box into the code shape becomes a whole-line highlight on the non-blank line nearest its endpoint; otherwise the arrow is a loss.
- **Output.** Imports get anchor lines (`[!mark:N..M]` slice-relative; substrings as `[!mark:"text"]`, with `#N` when the text repeats in the snippet). Inline fences get inline markers appended as trailing comments using the language's comment token (`//`, or `#` for YAML/shell).
  - Languages without line comments (XML/HTML, `text`) can't carry inline markers. For those, the highlight is recorded as a loss unless the block became a `<<<` import.
  - A line holds one inline marker, so nested ranges ending on the same line (WORKFLOW and JOB both ending on `- run: mvn test`) can't both be written. Narrower marks are placed first and the wider one is the loss: the frame around the whole block carries the least information.

### Build-ups

- Consecutive content slides are compared by a shape signature `(kind, normalized text, geometry rounded to 0.2 cm)`.
- Slide k+1 is a *build-up of* slide k when the titles are equal and slide k's signature multiset ⊆ slide k+1's.
- A run of build-ups merges when every addition is:
  - (a) an annotation rectangle, callout or connector on a code block also present in the first slide → callout step `{k}`;
  - (b) trailing list items → wrapped in `<v-clicks>` (or `v-click` per item when interleaved with earlier steps);
  - (c) images → `<img v-click …>` in document order, keeping `geometry.images` order.
- Any other addition keeps the run as separate slides, with a console warning naming the slides and the addition kinds.
- The ODP slide numbers in a merged run all map to the merged slide's Slidev number in loss reports.
- In the corpus no run qualifies. The GitHub Actions workflow slides (ODP 9–13) redraw and relabel boxes between slides rather than only adding them. The Tema 1.2 `MockTest` slides (111–113) each move a single callout to another line. Other build-ups add arrows or text over screenshots. These all correctly stay separate with a warning, so merging is covered by synthetic tests only.

### Comparison deck

- **LibreOffice detection.** `soffice --version` → parse `LibreOffice <major>.<minor>`; require ≥ 7.4.
- **Export.** `soffice -env:UserInstallation=file://<tmpdir> --headless --convert-to svg --outdir <tmpdir> <odp>`. The isolated profile avoids conflicts with a user's open LibreOffice session; lock files like `.~lock.*#` were observed in `odp/`.
- **Split.** Read `ooo:meta_slide` elements for `ooo:slide` → `ooo:master`. For each slide group, read its `ooo:name` (the ODP `draw:name`) to map it to the model. For slides with losses, write `root <svg>` attributes + all `<defs>` except the meta and animation defs + `<use xlink:href="#<master>"/>` + the slide group with its `visibility="hidden"` wrapper removed; drop `<script>`.
- **UNO rejected.** The Python-UNO PNG export works but needs `python3-uno`, and SVG export was chosen.
- **`comparison.md`.**
  - Headmatter (`theme: codeurjc-slidev-theme`, `aspectRatio: 16/9`), then for each converted slide with losses:
    ```md
    ---
    layout: image-right
    image: /odp-originals/page16.svg
    backgroundSize: contain
    ---
    # Slide 14
    ODP slide 16

    - 2 arrows omitted
    - highlight box not aligned to code lines
    ---
    src: ./slides.md#17
    ---
    ```
  - `image-right` is one of Slidev's built-in client layouts, so it isn't a `default` layout and doesn't disturb carry-over.
  - The `#` heading shows the **Slidev slide number**: the 1-based position among non-hidden slides, since Slidev never loads hidden ones.
  - The `src:` index is the slide's 1-based position among *all* parsed slides of `slides.md` (hidden ones included), which is what `parseRangeString` indexes. The two numbers differ whenever hidden slides precede.
  - Hidden slides with losses get only the information slide.
- **Carry-over in `src:` imports.** Slidev's `load()` fully parses `comparison.md` before the first `src:` stub triggers a single, cached `parse()` of `slides.md`. Both parses may share one preparser setup closure, and so one carry-over state.
  - Sharing is harmless as long as `comparison.md`'s own slides never set a heading: information slides use `image-right` (skipped by carry-over), and `src:` stubs have no content. `slides.md`'s parse then starts from an empty state, exactly as when presenting `slides.md` directly.
  - The importer therefore never writes `default`-layout content into `comparison.md`.
  - The first implementation task pins this with an e2e check. If it fails anyway, the fix goes in the theme's `setup/preparser.ts`: reset the carry state when a parse pass starts on a different markdown file.

### CLI surface

- `create-codeurjc-slidev [dir] --from-odp <file> [--code <dir>] [--code-repo <url>]`.
- An interactive `prompts` choice "Empty project / Import from ODP" runs when there's no `--from-odp` and no `dir`.
- The default dir is the slug of the ODP basename (NFD-normalized, diacritics removed, lowercased, non-alphanumerics → `-`).
- The template's `package.json` is reused with `export` set to `slidev export --with-clicks`, and `dev:compare` added when `comparison.md` is written. The template's starter `slides.md` is replaced.
- Images go to `public/images/<original Pictures/ file name>`.

### Test fixtures

- Real decks are **never committed**. `.gitignore` gains `odp/`.
- Tests needing them read from `<repo>/odp/`, overridable by `CODEURJC_ODP_FIXTURES`. When a file is missing they use `describe.skipIf` with a `console.warn` naming the missing fixture. LibreOffice-dependent tests likewise skip when `soffice` ≥ 7.4 isn't available.
- CI coverage comes from small synthetic ODPs assembled in tests (hand-written `content.xml`/`styles.xml` snippets zipped with `fflate`), one per rule and family.
- `CLAUDE.md` (Tests) and the package README state that the real fixture decks and their code folders are provided upon request to the author.

## Risks / Trade-offs

- [Heuristics overfit the 11-deck corpus and misclassify new decks] → Every unmatched or omitted shape becomes a reported loss, and the comparison deck shows the original beside the conversion, so misclassification is visible rather than silent. Thresholds live in one constants module, with corpus-driven tests guarding regressions.
- [Carry-over state could leak between `comparison.md` and `slides.md` parses] → Checked first (see the comparison-deck decision). The fallback options are listed there; this only affects the comparison deck, never `slides.md`.
- [A hidden first slide carrying the deck headmatter might not apply it] → Slidev reads headmatter from `entry.slides[0].frontmatter` before hide filtering (`fs.mjs`), so it should apply. A check with the generated project confirms it; if not, the importer emits the visible cover first and moves the hidden alternate cover after it.
- [Font substitution in split SVGs makes originals wrap differently than in LibreOffice] → Acceptable for a reference view. Documented; the deck is for human comparison, not a pixel diff.
- [Code drift means many blocks stay inline] → Intentional (the audience sees what the slide showed). Each is a reported loss with a link to the real file, so authors can switch to an import deliberately.
- [Bundling theme composables into the CLI can drift from the published theme version] → The CLI's `package.json` pins the theme version it scaffolds, and both are released together (same manual publish flow).
- [Line-height estimation for annotation alignment varies across decks] → 11 of 18 corpus rectangles align within tolerance. Misaligned ones degrade to losses rather than wrong highlights.
- [Real fixtures are unavailable in CI, so corpus tests never run there] → Synthetic fixtures cover each rule in CI; corpus tests run locally before publishing (noted in the development cycle docs).

## Open Questions

- Should `--from-odp` also accept a directory and import each ODP into its own sibling project? Not requested; out of scope unless asked.
