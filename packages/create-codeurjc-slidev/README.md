# create-codeurjc-slidev

Scaffolds a new [Slidev](https://sli.dev) presentation that uses [`codeurjc-slidev-theme`](https://www.npmjs.com/package/codeurjc-slidev-theme): a draggable layout editor, code-highlight callouts, code-snippet imports and slide title carry-over.

```sh
pnpm create codeurjc-slidev my-talk
```

Without arguments, the creator asks whether to start from an empty project or from an ODP presentation.

## Starting from an ODP presentation

```sh
pnpm create codeurjc-slidev tema-1-2 --from-odp "Tema 1.2 - Pruebas unitarias.odp"
```

Each ODP (LibreOffice Impress) file becomes one project. When no directory is given, it's named after the ODP (`tema-1-2-pruebas-unitarias`).

| Flag | Meaning |
|---|---|
| `--from-odp <file>` | The presentation to import. A missing or unreadable file aborts before anything is created. |
| `--code <dir>` | The code folder the slides show. Default: a folder next to the ODP with the same name (`Tema 1.2 - Pruebas unitarias/`). It's copied into `code/` without `target/`, `node_modules/`, `.git/`, `build/`, `dist/` or `.idea/`. Nothing is ever cloned. |
| `--code-repo <url>` | GitHub URL for source links, e.g. `https://github.com/org/repo/tree/main/testing_unitario` (the code folder's root maps to that path). Default: the code folder's own git `origin`, when it's a GitHub checkout and git doesn't ignore the folder. |

The import is a best effort:

- **Slides and titles:** one slide per ODP slide, in order. Hidden slides keep `hide: true`, and cover/copyright slides use the theme's layouts. Titles become `#` / `##` headings written only where they change, relying on the theme's title carry-over; a two-line title becomes chapter + subchapter.
- **Text:** bullet lists (with nesting), bold, italic, inline code, links and plain tables.
- **Images:** copied into `public/images/` and positioned with per-slide `geometry` frontmatter. Geometry and callouts name each picture by its `src` (`#2` for a picture shown twice), so adding another image to a slide later doesn't move them.
- **Code:**
  - A block that exactly matches a file in the code folder becomes a `<<< @/code/...` import, with a source link.
  - Code that differs from its file (elided or changed since) stays inline, with a link to the file.
  - Anything else stays inline.
  - Highlight boxes and callouts over code become code-highlight callouts, including several that land on the same line (nested boxes ending together, or a callout beside a box's last line).
- **Annotations over images:** an arrow from a text box into a screenshot becomes a callout anchored to that spot of the picture, an arrow with nothing at its other end becomes a bare arrow, and a label written on top of an image stays where it was drawn. They used to be reported as losses.
- **Diagrams drawn with shapes:**
  - A plain flowchart (labelled boxes joined by arrows in one direction) becomes a `mermaid` diagram. An arrow with a label pointing at one of its steps becomes a callout on that step.
  - Any other drawing that couldn't be converted without losing part of it (a class diagram, shapes drawn over a picture, rotated labels) becomes an SVG image cropped from LibreOffice's rendering of the slide, placed where it was. It isn't editable as text.
  - Without LibreOffice, those drawings are converted as far as possible and the rest is reported as lost.
- **Rotated shapes** (arrows turned to point up, rotated labels) keep their real position and direction.
- **Build-ups:** consecutive slides that each add a callout, bullet or image become a single slide with click steps. The project's `export` script uses `slidev export --with-clicks`, so the PDF keeps every step.

Everything that couldn't be converted (arrows, grouped shapes, OLE objects, ...) is listed in the console. Conversions worth a look that lost nothing (a diagram redrawn by mermaid or embedded as an image) are listed separately, as notes. `slides.md` itself never contains warnings.

### Comparison deck

When **LibreOffice ≥ 7.4** (`soffice`) is installed, the import also writes `comparison.md`: for every slide that lost something, the original slide (rendered by LibreOffice), the list of losses, and the converted slide next to it. Open it with:

```sh
pnpm run dev:compare
```

Without LibreOffice (or with an older version), the comparison deck and diagram images are skipped and the console says why. LibreOffice runs its export once per import, for both.

### Import report

Every import also writes a markdown report to `import-reports/import-report-<date>T<time>.md` inside the project (e.g. `import-report-2026-09-16T20-45-12.md`), so there's a lasting record beyond the console:

- **Context:** the ODP, when it was imported and with which version, the code folder, the source-link base, LibreOffice, and whether the comparison deck was written.
- **Summary and notices:** slide and code counts, and every console notice (no code folder, source links skipped, build-ups kept separate, ...).
- **Code:** every code block and how it matched the code folder: imported (with the file and lines), close to a file, no match, a terminal command, or no code folder at all. Useful to see which decks still need their code.
- **Notes and losses** per slide, with the matching slide of `comparison.md`.

Reports are never overwritten: each import adds a new one. Re-importing into an existing project keeps its `import-reports/` folder, even when you confirm removing the other files. New projects ignore `import-reports/` in `.gitignore`, since reports contain local paths; add that line yourself to projects created with an older version.

## Development

The importer lives in `src/odp/` (TypeScript) and ships bundled as `dist/odp-import.mjs` (`pnpm build`, run automatically before publishing). Tests run with `pnpm test`.

The tests use small synthetic ODP files built on the fly. `src/odp/__tests__/corpus.spec.ts` additionally converts the real CodeURJC course decks, but those decks and their code folders are **not** part of the repository; they are provided upon request to the author. Place them in the repository's `odp/` directory (gitignored), or point `CODEURJC_ODP_FIXTURES` at another directory. Tests whose decks are missing are skipped with a warning.
