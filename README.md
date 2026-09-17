# codeurjc-slidev

A [Slidev](https://sli.dev) theme for CodeURJC presentations.

Gives your presentation the CodeURJC look out of the box, plus a set of quality-of-life authoring features: code-highlight callouts (with click steps), code-snippet import from a `code/` directory, auto-fit text sizing, copy/paste image embedding, per-slide content/image positioning, and slide title/subtitle carry-over. Existing LibreOffice Impress (ODP) decks can be imported into a new project.

## Starting a new presentation

Scaffold a new CodeURJC-themed presentation with:

```sh
pnpm create codeurjc-slidev my-talk
cd my-talk
pnpm install
pnpm dev
```

This generates a standalone project with just `package.json`, `slides.md`, `code/`, and `public/images/logo.png`. The `codeurjc-slidev-theme` npm dependency provides the theme, editor, and all the authoring features.

- **[`codeurjc-slidev-theme`](https://www.npmjs.com/package/codeurjc-slidev-theme)** — the runtime Slidev theme (`theme: codeurjc-slidev-theme` in a presentation's frontmatter)
- **[`create-codeurjc-slidev`](https://www.npmjs.com/package/create-codeurjc-slidev)** — the scaffolding CLI used above

To start from an existing LibreOffice Impress deck instead, pass it with `--from-odp`:

```sh
pnpm create codeurjc-slidev tema-1-2 --from-odp "Tema 1.2 - Pruebas unitarias.odp"
```

Titles, lists, images, code (as `<<<` imports when it matches a file in the code folder) and code annotations are converted on a best-effort basis. Whatever can't be converted is listed in the console, and with LibreOffice ≥ 7.4 installed a `comparison.md` deck shows each affected slide next to its original. See [`packages/create-codeurjc-slidev/README.md`](packages/create-codeurjc-slidev/README.md) for all flags.

## Learning how to use it

`tutorial.md` walks through every authoring feature (theming, ODP import, code callouts and click steps, code-snippet import, per-slide geometry, QoL features, layout editor, etc.) as a Slidev presentation you can click through. Run it with:

```sh
pnpm dev tutorial.md
```

## Features

- Urjc-themed UnoCSS preset (`urjc-red`, `urjc-green` colors) applied throughout the layouts
- Code-highlight callouts: mark a line/range/substring in a fenced code block with `// [!mark]`, get a draggable, auto-placed callout box; add `{N}` (`// [!mark{2}]`) to reveal it at click N, kept as separate pages by `slidev export --with-clicks`
- Code-snippet import: `<<< @/code/path/to/File.java[selector] lang`, with the same highlight/callout markers declared in `slides.md` instead of the source file
- Auto-fit text sizing, copy/paste image embedding with position presets, Mermaid diagram centering, double-click to jump straight to a slide's markdown
- Per-slide geometry: a slide's `geometry` frontmatter positions its content box and any number of images, editable from the layout editor without touching the layout
- Slide title/subtitle carry-over across a run of same-topic slides
- ODP import: `create-codeurjc-slidev --from-odp` turns a LibreOffice Impress deck into a project, with a side-by-side comparison deck for whatever couldn't be converted
- Layout editor integrated into Slidev's built-in SideEditor panel: drag/resize slide elements (red bar, logo, title, content) with undo support, and save layouts as new `.vue` files or overwrite the current one

**Behaviour change (image positioning).** Images now stay in the normal flow of the slide unless the slide's `geometry.images` positions them. The paste presets (Below/Right) write that frontmatter instead of creating a `layouts/layout-<timestamp>.vue` copy, and the layout editor no longer has a layout-level "Image" element. Slides already pointing at such a copy keep working as before. To position an image on any other slide, paste it again and pick a preset, or add a `geometry.images` entry (`{src, x, y, w, h}`).

See `CLAUDE.md` for the full grammar/behavior reference (marker syntax, snippet-import selectors, title carry-over rules).

## VSCode editor support

A companion VSCode extension previews this theme's custom `slides.md` grammar directly in the editor, without running the Slidev dev server:

- **Marker preview** — dims `// [!mark]` markers in a fenced code block (since they're stripped from the rendered slide) while boxing the code they highlight, so you can see what the audience will see without building the deck.
- **Anchor/source hovers** — hovering a `[!mark:...]` anchor line or a `[!source ...]` directive line (following a `<<<` snippet import) shows what it resolves to: the target file, the matched line, the anchor's comment, or the source-link URL.
- **Diagnostics** — an unresolved or ambiguous anchor, an out-of-range `#N` occurrence, a `<<<` import that escapes the code root, or a source link with no resolvable git branch, all show up as real editor diagnostics instead of only a Vite dev-server console warning.
- **Reverse references** — open a file under `code/` on its own and, if any `<<<` import anywhere in the workspace references a line in it, a CodeLens shows which slide(s) reference it, with click-through navigation back to the slide.
- **Path completion + selector commands** — typing `<<< @/` offers file/folder completions rooted at the code root; a "Copy Selector for Selection" / "Paste Selector into Import" command pair computes a `[N-M]` or `["a".."b"]` selector from any selection and writes it into an existing `<<<` import's bracket, without hand-counting lines.
- **Import CodeLens** — "Open imported file" and, whenever it actually resolves, "Open source ↗" on every `<<<` import line — no more running the dev server just to confirm what a source-link directive links to.

Not yet published to the Marketplace — see [`packages/vscode-codeurjc-slidev/README.md`](packages/vscode-codeurjc-slidev/README.md) for how to run it locally.

## Other docs

- **[ROADMAP.md](ROADMAP.md)** — planned features and ideas not yet implemented
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — working on this repo itself: workspace layout, tests, and how to publish new versions of the theme/CLI
