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
- **Images:** copied into `public/images/` and positioned with per-slide `geometry` frontmatter.
- **Code:**
  - A block that exactly matches a file in the code folder becomes a `<<< @/code/...` import, with a source link.
  - Code that differs from its file (elided or changed since) stays inline, with a link to the file.
  - Anything else stays inline.
  - Highlight boxes and callouts over code become code-highlight callouts, including several that land on the same line (nested boxes ending together, or a callout beside a box's last line).
- **Build-ups:** consecutive slides that each add a callout, bullet or image become a single slide with click steps. The project's `export` script uses `slidev export --with-clicks`, so the PDF keeps every step.

Everything that couldn't be converted (arrows, diagrams, grouped shapes, callouts over screenshots, ...) is listed in the console. `slides.md` itself never contains warnings.

### Comparison deck

When **LibreOffice ≥ 7.4** (`soffice`) is installed, the import also writes `comparison.md`: for every slide that lost something, the original slide (rendered by LibreOffice), the list of losses, and the converted slide next to it. Open it with:

```sh
pnpm run dev:compare
```

Without LibreOffice (or with an older version), the comparison deck is skipped and the console says why.

## Development

The importer lives in `src/odp/` (TypeScript) and ships bundled as `dist/odp-import.mjs` (`pnpm build`, run automatically before publishing). Tests run with `pnpm test`.

The tests use small synthetic ODP files built on the fly. `src/odp/__tests__/corpus.spec.ts` additionally converts the real CodeURJC course decks, but those decks and their code folders are **not** part of the repository; they are provided upon request to the author. Place them in the repository's `odp/` directory (gitignored), or point `CODEURJC_ODP_FIXTURES` at another directory. Tests whose decks are missing are skipped with a warning.
