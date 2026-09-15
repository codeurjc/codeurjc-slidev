# Roadmap

## Remaining

- [ ] **Interactive diagram editing** — author Mermaid diagrams with an interactive editor instead of hand-written Mermaid/SVG source (they render centered today, but aren't editable in-place).
- [ ] **Synthetic/boilerplate slides** — auto-generated section index slide.
- [ ] **Smarter image pasting position** — improve where a pasted image gets placed by default in the layout, instead of the current fixed/best-effort placement.

## Done

- [x] Code-highlight callouts — `// [!mark]` marker syntax (whole line, multi-line range, substring), auto-placement/elbow-connector routing, and drag-to-reposition in the layout editor.
- [x] Callout click steps — `{N}` on inline marks and anchor lines reveals a highlight and its callout at click N, without moving callouts already shown; exported page by page with `slidev export --with-clicks`.
- [x] Code snippet import from real example files (`<<< @/code/...[selector] lang`), with absolute-line and content-anchor selectors, and standalone `[!mark:...]` anchor lines for highlights/callouts on imported snippets — fulfills the original "keep code shown in slides in sync with real examples" idea via a live-read-on-change approach.
- [x] Code source links — auto-detected GitHub links for imported snippets (branch/remote resolution), `[!source ...]` directive overrides, and manual opt-in links on hand-typed fences.
- [x] Slide title carry-over — independent title/subtitle inheritance chains across `default`-layout slides, with empty-heading and `resetTitle` resets.
- [x] Image pasting/positioning — drag/resize a pasted image via the layout editor, persisted per slide.
- [x] Per-slide geometry — `geometry` frontmatter positions a slide's content box and a list of images, edited from the Layout tab and written back to that slide's frontmatter.
- [x] ODP import — `create-codeurjc-slidev --from-odp` converts a LibreOffice Impress deck (titles with carry-over, lists, images, code imports and annotations, build-ups as click steps), reports what it couldn't convert, and writes a comparison deck when LibreOffice ≥ 7.4 is available.
- [x] Visual layout editor — drag/resize the red bar, logo, title, and content areas; positions persist to a consumer-local `layouts/default.vue` override.
- [x] Auto-fit text sizing — content shrinks to fit its box instead of overflowing, and the title shrinks (rather than wrapping to a second line) when a subtitle is present.
- [x] Centered Mermaid diagrams.
- [x] VSCode editor support — grammar-aware hovers, diagnostics, CodeLens (open imported file/source), path completion, and reverse-reference lookups, gated on `theme: codeurjc-slidev-theme`.
- [x] CI/tooling — lint, typecheck, unit tests (vitest), e2e (playwright), build smoke-test, and pre-commit hooks (`simple-git-hooks` + `lint-staged`).
